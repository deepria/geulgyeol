<script setup lang="ts">
import { ref } from 'vue'
const count = ref(0)
const accent = ref('mint')
const colors = ['mint', 'blue', 'pink']
</script>

<template>
  <div class="playground" :data-accent="accent">
    <header><a class="wordmark" href="/">d<span>·</span> deepria</a><a class="repo-link" href="https://github.com/deepria/temp" target="_blank" rel="noopener noreferrer">GitHub ↗</a></header>
    <main>
      <p class="eyebrow"><span class="dot"></span> PERSONAL PLAYGROUND</p>
      <h1>작은 아이디어를<br /><span>마음껏 펼치는 곳.</span></h1>
      <p class="intro">아직은 빈 캔버스. 떠오른 걸 만들고, 바꾸고, 다시 시작해보세요.</p>
      <section class="canvas" aria-label="인터랙션 실험">
        <div class="canvas-top"><span>EXPERIMENT 001</span><span>Vue 3 / TypeScript</span></div>
        <div class="experiment">
          <div class="orbit" aria-hidden="true"><div class="orb"></div><span class="spark">✳</span></div>
          <p>모든 시작은 작은 클릭 하나.</p>
          <button class="counter" @click="count++">클릭해보기 <span>{{ count }}</span><span aria-hidden="true">↗</span></button>
          <button class="reset" :disabled="count === 0" @click="count = 0">처음으로</button>
          <output class="sr-only" aria-live="polite">클릭 횟수 {{ count }}</output>
        </div>
        <div class="canvas-bottom"><span>MAKE SOMETHING YOURS.</span><div class="swatches" aria-label="테마 색상"><button v-for="color in colors" :key="color" :class="color" :aria-label="`${color} 테마`" :aria-pressed="accent === color" @click="accent = color"></button></div></div>
      </section>
      <div class="notes"><p><span>01</span> 아이디어를 코드로</p><p><span>02</span> 조금씩, 자유롭게</p><p><span>03</span> 다음 실험은 무엇일까?</p></div>
    </main>
    <footer><span>deepria playground</span><span>A little space for what’s next.</span></footer>
  </div>
</template>
