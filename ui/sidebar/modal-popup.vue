<template>
  <Transition name="modal">
    <div v-if="show" class="mp-background">
      <div class="mp-container">
        <div class="mp-header">
          <span class="close" @click="close">&times;</span>
          <h4 class="title">{{ title }}</h4>
        </div>
        <div class="mp-body">
          <slot></slot>
        </div>
        <div class="mp-footer">
          <slot name="footer"></slot>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script>
export default {
  data() {
    return {};
  },
  props: {
    title: String,
    show: Boolean,
  },
  methods: {
    close() {
      this.$emit("close");
    },
  },
};
</script>

<style scoped lang="scss">
.mp-background {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1000;
  width: 100vw;
  height: 100vh;
  background-color: var(--modal-overlay);
}

.mp-container {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1001;
  width: 90vw;
  background-color: var(--modal-bg);
  border-radius: 3px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  border-radius: 3px;
}

.mp-header {
  position: relative;
  padding: 8px;
  border-bottom: 1px solid var(--input-border);
  h4 {
    margin: 0;
  }
}

.mp-body {
  padding: 8px;
  max-height: 75vh;
  overflow: auto;
}

.mp-footer {
  padding: 8px;
  border-top: 1px solid var(--input-border);
}

.close {
  float: right;
  font-size: 14px;
  font-weight: bold;
  color: var(--highlight-text);
  cursor: pointer;
}
</style>
