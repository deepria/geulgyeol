#!/usr/bin/env python3
"""Deploy validated source and verify the public revision."""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request


class DeploymentError(Exception):
    pass


class RequestError(DeploymentError):
    def __init__(self, status: int | None, headers=None):
        self.status = status
        headers = headers or {}
        content_type = headers.get("Content-Type", "").split(";", 1)[0].lower()
        self.response_type = content_type if content_type in {"application/json", "text/html", "text/plain"} else "other"
        self.challenge = headers.get("cf-mitigated", "").lower() == "challenge"
        ray = headers.get("cf-ray", "")
        self.ray = ray if re.fullmatch(r"[a-fA-F0-9]{8,32}-[A-Z0-9]{2,8}", ray) else None
        message = f"HTTP {status}" if status else "connection failed"
        if status:
            message += f"; response={self.response_type}; challenge={self.challenge}"
            if self.ray:
                message += f"; cf-ray={self.ray}"
        super().__init__(message)

    @property
    def retryable(self) -> bool:
        return self.status is None or self.status in {404, 429, 500, 502, 503, 504}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def request_json(url: str, method: str = "GET", headers: dict | None = None, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, method=method, data=data, headers={
        "Accept": "application/json", "Cache-Control": "no-cache",
        "User-Agent": "deepria-playground-deployer/1.0",
        **({"Content-Type": "application/json"} if body is not None else {}),
        **(headers or {}),
    })
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=20) as response:
            if response.status != 200:
                raise RequestError(response.status, response.headers)
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Do not echo response bodies or headers: they may contain secrets or login pages.
        raise RequestError(error.code, error.headers) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise RequestError(None) from None
    except (ValueError, UnicodeError):
        raise DeploymentError("Expected a JSON response.") from None


def required(name):
    value = os.environ.get(name, '').strip()
    if not value:
        raise DeploymentError(f'Missing setting: {name}')
    return value


def verify_application(app, uuid):
    if (app.get('uuid') != uuid or app.get('build_pack') != 'dockerfile'
            or app.get('git_branch') != 'deploy'
            or app.get('git_repository', '').removesuffix('.git') not in
            {prefix + name for prefix in ('https://github.com/deepria/', 'git@github.com:deepria/', 'deepria/') for name in ('geulgyeol', 'temp')}):
        raise DeploymentError('Expected deepria/geulgyeol, deploy branch, Dockerfile build pack and matching UUID.')


def deploy(revision):
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise DeploymentError('Expected a full commit SHA.')
    uuid = required('COOLIFY_APPLICATION_UUID')
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', uuid):
        raise DeploymentError('Invalid application UUID.')
    base = 'https://coolify.deepria.com/api/v1'
    access = {'CF-Access-Client-Id': required('CF_ACCESS_CLIENT_ID'),
              'CF-Access-Client-Secret': required('CF_ACCESS_CLIENT_SECRET')}
    read_headers = access | {'Authorization': 'Bearer ' + required('COOLIFY_READ_TOKEN')}
    deploy_headers = access | {'Authorization': 'Bearer ' + required('COOLIFY_DEPLOY_TOKEN')}
    verify_application(request_json(base + '/applications/' + uuid, headers=read_headers), uuid)
    # Mutation is intentionally sent once; retry the workflow after inspecting Coolify.
    result = request_json(base + '/deploy', 'POST', deploy_headers, {'uuid': uuid})
    deployments = result.get('deployments', [])
    if len(deployments) != 1 or deployments[0].get('resource_uuid') != uuid:
        raise DeploymentError('Unexpected deployment response; inspect Coolify before retrying.')
    deployment_uuid = deployments[0].get('deployment_uuid', '')
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', deployment_uuid):
        raise DeploymentError('Missing valid deployment UUID.')
    print('Coolify deployment: ' + deployment_uuid, flush=True)
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        try:
            state = request_json(base + '/deployments/' + deployment_uuid, headers=read_headers)
            status = state.get('status')
            if status in {'failed', 'cancelled', 'canceled'}:
                raise DeploymentError('Coolify deployment ' + status)
            if status == 'finished':
                break
        except RequestError as error:
            if not error.retryable:
                raise
        time.sleep(10)
    else:
        raise DeploymentError('Timed out waiting for Coolify deployment.')
    while time.monotonic() < deadline:
        try:
            # Public app requests never include management credentials.
            payload = request_json('https://geulgyeol.deepria.com/version.json?revision=' + revision)
            if payload.get('revision') == revision:
                print('Verified public deployment: ' + revision, flush=True)
                return
        except RequestError as error:
            if not error.retryable:
                raise
        time.sleep(10)
    raise DeploymentError('Public app did not serve the expected revision before timeout.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--revision', required=True)
    args = parser.parse_args()
    try:
        deploy(args.revision)
    except DeploymentError as error:
        raise SystemExit(str(error)) from None
