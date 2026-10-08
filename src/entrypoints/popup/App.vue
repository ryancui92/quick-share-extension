<script setup lang="ts">
import QuickShareLogo from '@/components/icons/QuickShareLogo.vue';

const version = browser.runtime.getManifest().version;
</script>

<template>
  <main class="popup-shell">
    <div class="brand">
      <div class="brand-icon">
        <QuickShareLogo :size="27" />
      </div>
      <div class="brand-info">
        <div class="brand-title">
          <h1>QuickShare</h1>
          <span class="version">v{{ version }}</span>
        </div>
        <div class="authors" aria-label="作者：Ryan、Kafka">
          <span>by</span>
          <span class="author-names"><a href="https://github.com/ryancui92" target="_blank" rel="noopener noreferrer">Ryan</a>, <a href="https://github.com/hzCrafts" target="_blank" rel="noopener noreferrer">Kafka</a></span>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.popup-shell {
  width: 260px;
  padding: 22px;
  color: #20242b;
  background: #f9fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  user-select: none;
}
.brand {
  display: flex;
  align-items: center;
  gap: 13px;
}
.brand-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: #eef4fc;
  border: 1px solid rgba(73, 124, 196, .12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .9);
}
.brand-info { min-width: 0; }
.brand-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  white-space: nowrap;
}
h1 {
  margin: 0;
  font-size: 17px;
  line-height: 1.25;
  letter-spacing: -.02em;
  font-weight: 700;
}
.version {
  color: #8b929d;
  font-size: 11px;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.authors {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  color: #777f8a;
  font-size: 12px;
  line-height: 1.3;
}
.authors a {
  color: inherit;
  text-decoration: none;
  border-radius: 3px;
}
.authors a:hover,
.authors a:focus-visible {
  color: #2774c7;
  text-decoration: underline;
  text-underline-offset: 2px;
}
@media (prefers-color-scheme: dark) {
  .popup-shell { color: #f3f5f7; background: #191b1f; }
  .brand-icon {
    background: #222c3b;
    border-color: rgba(112, 156, 216, .2);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .06);
  }
  .version { color: #9299a5; }
  .authors { color: #adb3be; }
  .authors a:hover,
  .authors a:focus-visible { color: #83b8f2; }
}
</style>
