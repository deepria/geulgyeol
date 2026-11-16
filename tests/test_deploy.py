import unittest
from unittest.mock import patch
from scripts import deploy

UUID = 'test-app'
SHA = 'a' * 40
APP = {'uuid': UUID, 'build_pack': 'dockerfile', 'git_branch': 'deploy',
       'git_repository': 'https://github.com/deepria/temp.git'}
ENV = {'COOLIFY_APPLICATION_UUID': UUID, 'CF_ACCESS_CLIENT_ID': 'cf-id',
       'CF_ACCESS_CLIENT_SECRET': 'cf-secret', 'COOLIFY_READ_TOKEN': 'read-token',
       'COOLIFY_DEPLOY_TOKEN': 'deploy-token'}


class DeployTests(unittest.TestCase):
    @patch.dict('os.environ', ENV, clear=True)
    @patch('scripts.deploy.request_json')
    def test_waits_and_keeps_credentials_off_public_requests(self, request):
        request.side_effect = [APP, {'deployments': [{'resource_uuid': UUID,
            'deployment_uuid': 'deployment-1'}]}, {'status': 'finished'}, {'revision': SHA}]
        deploy.deploy(SHA)
        calls = request.call_args_list
        self.assertEqual(calls[0].kwargs['headers']['Authorization'], 'Bearer read-token')
        self.assertEqual(calls[1].args[2]['Authorization'], 'Bearer deploy-token')
        self.assertTrue(calls[-1].args[0].startswith('https://temp.deepria.com/'))
        self.assertEqual(len(calls[-1].args), 1)
        self.assertEqual(calls[-1].kwargs, {})

    @patch.dict('os.environ', ENV, clear=True)
    @patch('scripts.deploy.request_json')
    def test_wrong_resource_never_triggers_deployment(self, request):
        request.return_value = APP | {'git_branch': 'main'}
        with self.assertRaises(deploy.DeploymentError):
            deploy.deploy(SHA)
        self.assertEqual(request.call_count, 1)

    @patch.dict('os.environ', ENV, clear=True)
    @patch('scripts.deploy.request_json')
    def test_mutation_is_not_retried(self, request):
        request.side_effect = [APP, deploy.RequestError(503)]
        with self.assertRaises(deploy.RequestError):
            deploy.deploy(SHA)
        self.assertEqual(request.call_count, 2)

    @patch.dict('os.environ', ENV, clear=True)
    @patch('scripts.deploy.request_json')
    def test_failed_deployment_fails_job(self, request):
        request.side_effect = [APP, {'deployments': [{'resource_uuid': UUID,
            'deployment_uuid': 'deployment-1'}]}, {'status': 'failed'}]
        with self.assertRaises(deploy.DeploymentError):
            deploy.deploy(SHA)
        self.assertEqual(request.call_count, 3)

    def test_invalid_revision_rejected(self):
        with self.assertRaises(deploy.DeploymentError):
            deploy.deploy('main')


if __name__ == '__main__':
    unittest.main()
