<template>
  <div class="sub-info-title">
    {{ attr.release }}
  </div>
  <div class="sub-info-uploader">
    <div>
      <span class="sub-info-label">Language:</span>
      <span>{{ langDescription(attr.language) }}</span>
    </div>
    <div>
      <span class="sub-info-label">Uploaded by</span>
      <span>{{ attr.uploader.name }} ({{ attr.uploader.rank }})</span>
    </div>
    <div>
      <span class="sub-info-label">Date:</span>
      <span>{{ new Date(attr.upload_date).toLocaleString() }}</span>
    </div>
  </div>
  <div class="sub-info-ratings">
    <span
      >{{ attr.ratings }}★ / {{ attr.votes }} votes /
      {{ attr.points ?? "0" }} points</span
    >
  </div>
  <div class="sub-info-feature">
    <div class="feature-title">
      {{ feat.title }} ({{ feat.year }})
      <span class="feature-type">{{ feat.feature_type }}</span>
    </div>
    <div class="sub-info-detail">
      <span class="sub-info-label">IMDB:</span>
      <span>{{ feat.imdb_id }}</span>
      &nbsp;/&nbsp;
      <span class="sub-info-label">TMDB:</span>
      <span>{{ feat.tmdb_id }}</span>
    </div>
  </div>
  <div class="sub-info-details">
    <div class="sub-info-detail">
      <span class="sub-info-label">FPS:</span>
      <span>{{ attr.fps }}</span>
    </div>
    <div class="sub-info-detail">
      <span class="sub-info-label">Downloads:</span>
      <span>{{ attr.download_count }} ({{ attr.new_download_count }} new)</span>
    </div>
    <div class="sub-info-detail">
      <span class="sub-info-label">Trusted Source:</span>
      <span>{{ attr.from_trusted }}</span>
    </div>
    <div class="sub-info-detail">
      <span class="sub-info-label">AI Translated:</span>
      <span>{{ attr.ai_translated }}</span>
    </div>
    <div class="sub-info-detail">
      <span class="sub-info-label">Machine Translated:</span>
      <span>{{ attr.machine_translated }}</span>
    </div>
    <div class="sub-info-detail">
      <span class="sub-info-label">Hearing Impaired:</span>
      <span>{{ attr.hearing_impaired }}</span>
    </div>
    <div class="sub-info-detail">
      <span class="sub-info-label">Comments:</span>
      <span>{{ attr.comments ?? "N/A" }}</span>
    </div>
    <div class="sub-info-files">
      <div class="sub-info-label">Files:</div>
      <ul>
        <li v-for="file in attr.files" :key="file.id">
          {{ file.file_name }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    sub: {
      type: Object,
      required: true,
    },
    langMap: {
      type: Object,
    },
  },
  computed: {
    attr() {
      return this.sub.attributes;
    },
    feat() {
      return this.sub.attributes.feature_details;
    },
  },
  methods: {
    langDescription(lang) {
      const name = this.langMap[lang.toLowerCase()];
      return `${name} (${lang})`;
    },
  },
};
</script>

<style scoped lang="scss">
.sub-info-title {
  margin: 4px 0;
}

.sub-info-label {
  margin-right: 4px;
  & + span {
    opacity: 0.6;
  }
}

.sub-info-ratings {
  margin: 4px 0;
  text-align: center;
}

.sub-info-feature {
  font-size: 90%;
  margin: 8px -1px 8px -1px;
  background: var(--input-border-light);
  border: 1px solid var(--input-border);
  border-radius: 3px;
  padding: 4px;
}

.feature-title {
  font-weight: bold;
  margin-bottom: 4px;
}

.feature-type {
  background: var(--input-border-dark);
  margin-left: 2px;
  border-radius: 3px;
  padding: 0 4px;
  font-size: 90%;
}

.sub-info-uploader {
  font-size: 90%;
  opacity: 0.8;
  margin: 4px 0;
}

.sub-info-details {
  font-size: 90%;
}

.sub-info-files {
  margin-top: 8px;
  border-top: 1px solid var(--input-border);
  padding: 4px 0;
  ul {
    list-style: none;
    opacity: 0.8;
    padding: 0;
    margin: 0;
    li {
      margin: 2px 0;
    }
  }
}
</style>
