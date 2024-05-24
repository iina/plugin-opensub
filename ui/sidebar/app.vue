<template>
  <div>
    <div id="header" class="ui-lr">
      <div class="left">
        <div
          :class="[
            'header-item',
            'ui-clickable',
            'ui-hover',
            { active: showUserPopup },
          ]"
          v-if="userInfo"
          @click="showUserPopup = !showUserPopup"
        >
          <FontAwesomeIcon :icon="['fas', 'user']" size="sm" />
          <span>{{ userInfo.username }}</span>
          <span v-if="userInfo.vip"> (VIP)</span>
          <div class="popup-menu-container" v-if="showUserPopup">
            <div class="user-info">
              <span class="title">ID</span>: {{ userInfo.user_id }}<br />
              <span class="title">Level</span>: {{ userInfo.level }}<br />
              <span class="title">Allowed downloads</span>:
              {{ userInfo.allowed_downloads }}<br />
              <span class="title">Allowed translations</span>:
              {{ userInfo.allowed_translations }}<br />
              <span class="title">Downloads count</span>:
              {{ userInfo.downloads_count }}<br />
              <span class="title">Remaining downloads</span>:
              {{ userInfo.remaining_downloads }}<br />
              <span class="title">Reset time (last updated)</span>:
              {{ userInfo.reset_time }}<br />
            </div>
            <hr />
            <div class="ui-clickable ui-hover" @click="logout">Log out</div>
          </div>
        </div>
        <div v-else class="header-item ui-clickable ui-hover" @click="login">
          Log in
        </div>
      </div>
      <div class="right">
        <div
          v-if="quotaInfo"
          class="header-item ui-hover"
          :title="quotaDetails"
        >
          <FontAwesomeIcon :icon="['fas', 'pie-chart']" size="sm" />
          {{ quotaInfo.remaining }}
        </div>
        <div
          :class="[
            'header-item',
            'ui-clickable',
            'ui-hover',
            { active: showLog },
          ]"
          @click="showLog = !showLog"
        >
          <FontAwesomeIcon :icon="['fas', 'circle-info']" size="sm" />
          <span>Log</span>
          <div class="popup-menu-container log-container" v-if="showLog">
            <div class="log-item" v-for="log in logs" :key="log.id">
              <div class="time">{{ fmtTime(log.time) }}</div>
              <div>{{ log.message }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="search" class="ui-lr">
      <div class="left search-container">
        <input
          type="text"
          placeholder="Search…"
          v-model="searchText"
          @keypress="searchBoxKeyPress"
        />
      </div>
      <div class="right">
        <button @click="showOptions = !showOptions">...</button>
      </div>
    </div>
    <div id="search-options" :class="{ show: showOptions }">
      <div class="search-opt-actions ui-lr">
        <div class="left">
          <button @click="setLanaguages">Languages...</button>
        </div>
        <div class="right">
          <button @click="pasteFilename" style="margin-right: 4px">
            Paste filename
          </button>
          <button @click="performSearch">Search</button>
        </div>
      </div>
      <div class="search-opt-item">
        <label for="search-opt-label">Type</label>
        <div class="segmented-control" ref="segm">
          <template v-for="(opt, key) in searchOptions.subType">
            <input
              :id="'radio-type-' + key"
              :name="'segmented-type'"
              type="radio"
              :value="key"
              v-model="optType"
            />
            <label :for="'radio-type-' + key">{{ opt }}</label>
          </template>
        </div>
      </div>
      <div class="search-opt-item">
        <label for="search-opt-machine">Include machine translated</label>
        <input
          type="checkbox"
          id="search-opt-machine"
          v-model="optMachineTranslated"
        />
      </div>
      <div class="search-opt-item">
        <label for="search-opt-ai">Include AI translated</label>
        <input type="checkbox" id="search-opt-ai" v-model="optAiTranslated" />
      </div>
      <div class="search-opt-item">
        <label for="search-opt-trusted">Only from trusted source</label>
        <input
          type="checkbox"
          id="search-opt-trusted"
          v-model="optTrustedSourceOnly"
        />
      </div>
      <div class="search-opt-item">
        <div class="search-opt-label">Hearing impared</div>
        <div class="segmented-control" ref="segm">
          <template v-for="(opt, key) in searchOptions.hearingImpaired">
            <input
              :id="'radio-impaired-' + key"
              :name="'segmented-impaired'"
              type="radio"
              :value="key"
              v-model="optHearingImpaired"
            />
            <label :for="'radio-impaired-' + key">{{ opt }}</label>
          </template>
        </div>
      </div>
    </div>
    <div id="mesages">
      <div v-if="errorGettingLanguages" class="message-item">
        Cannot get language list. Using {{ subLang.join(",") }} for now.
      </div>
      <div v-if="langString.length < 1" class="message-item">
        Language not set. Using English by default. Click
        <a @click="setLanaguages">here</a> to set.
      </div>
      <div v-if="errorSavingJWT" class="message-item">
        Cannot save the JWT token to keychain. Login status will not be saved.
      </div>
    </div>
    <div id="search-results">
      <div v-if="isSearching" class="search-reuslts-alert">Loading...</div>
      <div v-else-if="searchResults === null"></div>
      <div v-else-if="searchResults.length === 0" class="search-reuslts-alert">
        No result.
      </div>
      <div v-else>
        <!-- search pagination -->
        <div class="search-pagination" v-if="pageTotal > 1">
          <button :disabled="pageNumber === 1" @click="performSearch(1)">
            First
          </button>
          <button
            :disabled="pageNumber === 1"
            @click="performSearch(pageNumber - 1)"
          >
            Prev
          </button>
          <span>{{ pageNumber }} / {{ pageTotal }}</span>
          <button
            :disabled="pageNumber === pageTotal"
            @click="performSearch(pageNumber + 1)"
          >
            Next
          </button>
          <button
            :disabled="pageNumber === pageTotal"
            @click="performSearch(pageTotal)"
          >
            Last
          </button>
        </div>
        <!-- search result list -->
        <div class="search-results-container">
          <div
            v-for="result in searchResults"
            :key="result.id"
            class="result-item"
          >
            <div class="overlay">
              <div class="ui-lr">
                <div class="left"></div>
                <div class="right">
                  <div class="overlay-btn-container">
                    <div class="overlay-btn" @click="showSubInfo(result)">
                      <FontAwesomeIcon :icon="['fas', 'info']" fixed-width />
                    </div>
                    <div class="overlay-btn" @click="download(result)">
                      <FontAwesomeIcon
                        :icon="['fas', 'download']"
                        fixed-width
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="result-feature">
              {{ itemFeatureDesc(result) }}
            </div>
            <div class="result-filename">{{ result.attributes.release }}</div>
            <div class="result-info ui-lr">
              <div class="left">
                <span v-if="!lastSearchIsSingleLanguage" class="result-lang">{{
                  getLanguageName(result.attributes.language)
                }}</span>
                <span>{{ result.attributes.fps }}fps</span>
                <span>DL:{{ itemDL(result) }}︎</span>
                <span>{{ result.attributes.ratings }}★</span>
              </div>
              <div class="right">
                <span v-if="result.attributes.ai_translated">AI</span>
                <span v-if="result.attributes.machine_translated">MT</span>
                <span>{{ itemDate(result) }}</span>
              </div>
            </div>
          </div>
        </div>
        <!-- search pagination -->
        <div class="search-pagination" v-if="pageTotal > 1">
          <button :disabled="pageNumber === 1" @click="performSearch(1)">
            First
          </button>
          <button
            :disabled="pageNumber === 1"
            @click="performSearch(pageNumber - 1)"
          >
            Prev
          </button>
          <span>{{ pageNumber }} / {{ pageTotal }}</span>
          <button
            :disabled="pageNumber === pageTotal"
            @click="performSearch(pageNumber + 1)"
          >
            Next
          </button>
          <button
            :disabled="pageNumber === pageTotal"
            @click="performSearch(pageTotal)"
          >
            Last
          </button>
        </div>
      </div>
    </div>
    <!-- Modal -->
    <ModalPopup
      :title="modalTitle"
      :show="modalShow"
      @close="modalShow = false"
    >
      <template v-slot>
        <!-- Modal: Login -->
        <div v-if="modalType === 'login'">
          <div>
            Please enter your <em>opensubtitles.com</em> username and password.
            Note that this is not the same as your
            <em>opensubtitles.org</em> account. If you have not
            <a href="https://www.opensubtitles.com/users/import">migrated</a>
            your account yet, please do so before logging in.
          </div>
          <div class="login-container">
            <input
              type="text"
              placeholder="Username"
              autocorrect="off"
              autocomplete="off"
              v-model="loginUsername"
            />
            <input
              type="password"
              placeholder="Password"
              v-model="loginPassword"
            />
          </div>
          <p v-if="loginError.length" class="login-error">{{ loginError }}</p>
        </div>
        <!-- Modal: Subtitle Info -->
        <div v-if="modalType === 'subInfo'" class="sub-info">
          <SubInfo :sub="subInfo" :langMap="langMap" />
        </div>
        <!-- Modal: Languages -->
        <div v-if="modalType === 'lang'" class="lang-select">
          <div v-if="langList === null">Loading...</div>
          <div v-else class="lang-container">
            <div
              v-for="lang in sortedLangList"
              :key="lang.code"
              class="lang-item"
            >
              <input
                type="checkbox"
                :id="'lang-' + lang.language_code"
                :value="lang.language_code"
                v-model="subLang[lang.language_code]"
              />
              <label :for="'lang-' + lang.language_code">{{
                lang.language_name
              }}</label>
            </div>
          </div>
        </div>
      </template>
      <template v-slot:footer>
        <div v-if="modalType === 'login'" class="ui-lr">
          <div class="left"></div>
          <div class="right">
            <button @click="performLogin" :disabled="loggingIn">Login</button>
          </div>
        </div>
        <div v-if="modalType === 'subInfo'" class="ui-lr">
          <div class="left">
            <button @click="showInBrowser(subInfo)">Show in browser</button>
          </div>
          <div class="right">
            <button @click="download(subInfo)">Download</button>
          </div>
        </div>
        <div v-if="modalType === 'lang'" class="ui-lr">
          <div class="left">Selected: {{ langString }}</div>
          <div class="right">
            <button @click="modalShow = false">Close</button>
          </div>
        </div>
      </template>
    </ModalPopup>
    <!-- end Modal -->
  </div>
</template>

<script>
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import ModalPopup from "./modal-popup.vue";
import SubInfo from "./sub-info.vue";
import { client, rpc } from "./index.js";

const searchOptions = {
  subType: {
    movie: "Movie",
    episode: "Episode",
    all: "All",
  },
  hearingImpaired: {
    include: "Include",
    exclude: "Exclude",
    only: "Only",
  },
};

export default {
  data() {
    return {
      searchOptions,
      userInfo: null,
      quotaInfo: null,
      showOptions: false,
      modalTitle: "",
      modalType: "",
      modalShow: false,
      langList: null,
      langMap: null,
      subLang: { en: true },
      loginUsername: "",
      loginPassword: "",
      loginError: "",
      loggingIn: false,
      searchText: "",
      isSearching: false,
      subInfo: null,
      cachedSearch: null,
      logs: [],
      // ui
      showUserPopup: false,
      showLog: false,
      // options
      optType: "all",
      optMachineTranslated: false,
      optAiTranslated: true,
      optTrustedSourceOnly: false,
      optHearingImpaired: "include",
      // results
      searchResults: null,
      pageNumber: 1,
      pageTotal: 1,
      // errors
      errorGettingLanguages: false,
      errorSavingJWT: false,
    };
  },
  mounted() {
    // login
    setTimeout(async () => {
      this.log(`Login status: ${client.loggedIn}`);
      if (client.loggedIn) {
        const info = await client.getUserInfo();
        this.userInfo = { ...info.data, username: client.username };
        this.log(`Logged in as ${client.username}`);
      }
    }, 1000);
    // get languages
    (async () => {
      const lang = await rpc.$getLanguages();
      console.log("lang", lang);
      for (const l of lang.split(",")) {
        console.log("l", l);
        this.subLang[l] = true;
      }
      await this.refreshLanguageList();
    })();
    global.startSearch = async () => {
      await this.pasteFilename();
      await this.performSearch();
    };
  },
  computed: {
    userDetail() {
      if (!this.userInfo) return "Not logged in";
      const { allowed_downloads, allowed_translations, user_id } =
        this.userInfo;
      return `User ID: ${user_id}, Downloads: ${allowed_downloads}, Translations: ${allowed_translations}`;
    },
    sortedLangList() {
      if (!this.langList) return [];
      return this.langList.sort((a, b) =>
        a.language_name.localeCompare(b.language_name),
      );
    },
    langString() {
      return Object.keys(this.subLang)
        .filter((k) => k && this.subLang[k])
        .toSorted()
        .join(",");
    },
    lastSearchIsSingleLanguage() {
      return this.cachedSearch.languages.indexOf(",") < 0;
    },
    quotaDetails() {
      return `Requests: ${this.quotaInfo.requests}\nRemaining: ${this.quotaInfo.remaining}\n${this.quotaInfo.message}`;
    },
  },
  watch: {
    langString(newVal) {
      rpc.$setLanguages(newVal);
    },
  },
  methods: {
    log(message, level = "info") {
      this.logs.push({
        id: this.logs.length,
        time: new Date(),
        message,
        level,
      });
      if (level === "error") {
        console.error(message);
      }
    },
    fmtTime(time) {
      const p = (num) => num.toString().padStart(2, "0");
      return (
        p(time.getHours()) +
        ":" +
        p(time.getMinutes()) +
        ":" +
        p(time.getSeconds())
      );
    },
    login() {
      console.log("login");
      this.showModal("login", "Login");
    },
    async logout() {
      this.log("Logging out");
      await client.logout();
      this.userInfo = null;
      this.showUserPopup = false;
      this.log("Logged out");
    },
    async refreshLanguageList() {
      try {
        this.langList = (await client.getLanguages()).data;
        this.langMap = this.langList.reduce((acc, l) => {
          acc[l.language_code] = l.language_name;
          return acc;
        }, {});
        const keys = new Set(Object.keys(this.subLang));
        const newKeys = new Set(this.langList.map((l) => l.language_code));
        for (const lang of keys.difference(newKeys)) {
          this.subLang[lang.language_code] = false;
        }
        for (const key of newKeys.difference(keys)) {
          delete this.subLang[key];
        }
        this.log("Languages updated");
      } catch (err) {
        this.log(`Error getting languages: ${err}`, "error");
        this.errorGettingLanguages = true;
      }
    },
    getLanguageName(code) {
      let name = this.langMap[code.toLowerCase()];
      if (name.length > 7) {
        name = name.slice(0, 6) + "..";
      }
      return name;
    },
    async performLogin() {
      this.loggingIn = true;
      try {
        const resData = await client.login(
          this.loginUsername,
          this.loginPassword,
        );
        console.log(resData);
        const { user } = resData;
        this.userInfo = { ...user, username: this.loginUsername };
        this.loginPassword = "";
        this.modalShow = false;
        this.errorSavingJWT = !resData.jwtSaved;
        this.log(
          `Logged in as ${this.loginUsername}, jwt saved: ${resData.jwtSaved}`,
        );
      } catch (err) {
        this.log(`Login error: ${err}`, "error");
        this.loginError = err.message;
      } finally {
        this.loggingIn = false;
      }
    },
    async download(item) {
      console.log("Download", item);
      this.log(
        `Downloading ${item.attributes.release} (ID: ${item.id}, ${item.attributes.files.length} files)`,
      );
      const fidList = item.attributes.files.map((f) => f.file_id);
      if (fidList.length < 1) {
        rpc.$sendOSD("No files to download");
        console.error("No files to download");
        return;
      }
      rpc.$sendOSD("Downloading…");
      const res = await client.download(fidList);
      this.log(
        `Downloaded ${item.attributes.release} (${fidList.length} files)`,
      );
      console.log("Download", res);
      const { requests, remaining, message } = res;
      this.quotaInfo = { requests, remaining, message };
      this.userInfo.downloads_count = requests;
      this.userInfo.remaining_downloads = remaining;
      this.userInfo.reset_time = message;
    },
    showModal(type, title) {
      this.modalType = type;
      this.modalTitle = title;
      this.modalShow = true;
    },
    showSubInfo(sub) {
      this.subInfo = sub;
      this.showModal("subInfo", "Subtitle Details");
    },
    hideSubInfo() {
      this.subInfo = null;
      this.modalShow = false;
    },
    setLanaguages() {
      this.showModal("lang", "Languages");
      this.refreshLanguageList();
    },
    searchBoxKeyPress(e) {
      console.log("searchBoxKeyPress", e);
      if (e.key === "Enter") {
        this.performSearch();
      }
    },
    async pasteFilename() {
      const fn = await rpc.$getFileName();
      this.searchText = fn;
    },
    async performSearch(page = null) {
      this.isSearching = true;
      if (page == null) {
        this.log(`Searching for ${this.searchText}`);
      }
      try {
        const query = this.searchText;
        let options;
        if (page && this.cachedSearch) {
          options = { ...this.cachedSearch, page };
        } else {
          options = {
            query,
            type: this.optType,
            languages: this.langString,
            machine_translated: this.optMachineTranslated
              ? "include"
              : "exclude",
            ai_translated: this.optAiTranslated ? "include" : "exclude",
            trusted_sources: this.optTrustedSourceOnly ? "only" : "exclude",
            hearing_impaired: this.optHearingImpaired,
          };
        }
        this.cachedSearch = null;
        const resData = await client.search(options);
        this.cachedSearch = options;
        this.searchResults = resData.data;
        this.pageNumber = resData.page;
        this.pageTotal = resData.total_pages;
        if (page == null) {
          this.log(`Search results: ${resData.data.length} items`);
        }
      } catch (err) {
        this.log(`Search error: ${err}`, "error");
        this.searchResults = [];
      } finally {
        this.isSearching = false;
      }
    },
    itemFeatureDesc(item) {
      const details = item.attributes.feature_details;
      return `${details.title} (${details.year})`;
    },
    itemDL(item) {
      const count = item.attributes.download_count;
      return count > 1000 ? `${(count / 1000).toFixed(1)}k` : count;
    },
    itemDate(item) {
      return item.attributes.upload_date.split("T")[0];
    },
    showInBrowser(subItem) {
      console.log(subItem);
      rpc.$openLink(subItem.attributes.url);
    },
  },
  components: { ModalPopup, FontAwesomeIcon, SubInfo },
};
</script>

<style scoped lang="scss">
a {
  color: var(--highlight-color);
  cursor: pointer;
}

.header-item {
  padding: 2px 8px;
  margin: -2px 0;
  border-radius: 8px;
  position: relative;
  &.active {
    background: rgba(0, 0, 0, 0.2);
  }
  .fa-sm {
    margin-right: 4px;
  }
}

.popup-menu-container {
  position: absolute;
  top: 24px;
  left: 4px;
  width: 300px;
  padding: 8px;
  background-color: var(--popup-bg) !important;
  border-radius: 3px;
  border: 1px solid var(--input-border);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
  z-index: 10;
  font-size: 90%;
  &.log-container {
    left: unset;
    right: 0;
    max-height: 80vh;
    overflow-y: auto;
    .log-item {
      padding: 2px 0;
      .time {
        font-size: 90%;
        opacity: 0.8;
      }
    }
  }

  .title {
    font-weight: bold;
    color: var(--highlight-text);
  }

  .ui-clickable {
    color: var(--highlight-color);
    cursor: pointer;
  }
}

#search {
  margin: 12px 0 8px 0;
  padding: 0 7px;
}

.search-container {
  width: 100%;
  padding-right: 8px;
  input {
    width: 100%;
    padding: 4px;
    color: var(--searchbox-text);
    border: 1px solid var(--input-border);
    background-color: var(--searchbox-bg);
    border-radius: 3px;
    margin-top: -2px;
  }
}

#search-options {
  display: none;
  margin: 0 7px 8px 7px;
  padding: 4px 8px;
  background-color: var(--box-bg);
  border-radius: 3px;
  border: 1px solid var(--input-border);
  font-size: 90%;
  &.show {
    display: block;
  }
  .search-opt-item {
    margin: 4px 0;
    display: flex;
    justify-content: space-between;
    input {
      margin-right: 4px;
    }
  }
  .search-opt-label {
    padding: 2px 0;
    margin-right: 8px;
  }
  .search-opt-actions {
    border-bottom: 1px solid var(--input-border);
    padding: 4px 0 8px 0;
    margin-bottom: 8px;
  }
}

.lang-container {
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  .lang-item {
    margin: 4px 4px;
    input {
      display: none;
    }
    label {
      margin: 0;
      padding: 2px 4px;
      background-color: var(--input-border);
      border-radius: 8px;
    }
    input:checked + label {
      background-color: var(--highlight-color);
    }
  }
}

#mesages {
  padding: 0 8px;
  font-size: 90%;
  .message-item {
    margin-bottom: 4px;
    color: #ff4455;
  }
}

.search-pagination {
  margin: 8px 0;
  text-align: center;
  span {
    margin: 0 8px;
  }
  button {
    margin: 0 4px;
  }
}

#search-results {
  margin: 0 7px;
  .search-reuslts-alert,
  .search-results-container {
    background-color: var(--box-bg);
    border-radius: 3px;
    border: 1px solid var(--input-border);
  }
  .search-reuslts-alert {
    padding: 8px;
    text-align: center;
  }
  .search-results-container {
    .result-item {
      position: relative;
      padding: 6px 8px;
      border-top: 1px solid var(--input-border);
      width: 100%;
      overflow: hidden;
      &:first-of-type {
        border-top: none;
        border-radius: 3px 3px 0 0;
      }
      &:last-of-type {
        border-radius: 0 0 3px 3px;
      }
      .result-feature {
        font-weight: bold;
        opacity: 0.6;
        margin-bottom: 2px;
      }
      .result-filename {
        margin-bottom: 2px;
      }
      .result-info {
        font-size: 10px;
        span {
          opacity: 0.8;
        }
        .left span {
          margin-right: 8px;
        }
        .right span {
          margin-left: 8px;
        }
        .result-lang {
          background: var(--input-border);
          border-radius: 3px;
          padding: 0 4px;
          opacity: 1;
        }
      }
      .overlay {
        display: none;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgb(38, 38, 38, 0.2);
        background: linear-gradient(
          90deg,
          rgba(0, 0, 0, 0) 60%,
          rgba(0, 0, 0, 0.4) 70%,
          rgba(0, 0, 0, 1) 100%
        );
        z-index: 10;
        .overlay-btn-container {
          /* center vertically */
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          right: 0;
          padding: 0 8px;
          display: flex;
        }
        .overlay-btn {
          cursor: pointer;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 8px;
          margin: 0 4px;
          width: 32px;
          height: 32px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.1);
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          &:hover {
            background: rgba(255, 255, 255, 0.4);
          }
        }
        @media (prefers-color-scheme: light) {
          background: rgb(255, 255, 255, 0.2);
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0) 40%,
            rgba(255, 255, 255, 0.4) 60%,
            rgba(255, 255, 255, 0.8) 100%
          );
          .overlay-btn {
            background: rgba(0, 0, 0, 0.2);
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
            &:hover {
              background: rgba(0, 0, 0, 0.3);
            }
          }
        }
      }
      &:hover .overlay {
        display: block;
      }
    }
  }
}

.login-container {
  margin: 8px 0;
  input {
    width: 100%;
    padding: 4px;
    border: 1px solid var(--input-border-light);
    border-radius: 3px;
    margin: 4px 0;
  }
}

.login-error {
  color: #ff4455;
}

.segmented-control {
  display: inline-flex;

  input[type="radio"] {
    display: none;
  }

  label {
    border: 1px solid var(--input-border-light);
    border-right: none;
    padding: 1px 6px;
    background: rgba(slategrey, 0.2);

    &:first-of-type {
      border-top-left-radius: 4px;
      border-bottom-left-radius: 4px;
    }

    &:last-of-type {
      border-top-right-radius: 4px;
      border-bottom-right-radius: 4px;
      border-right: 1px solid var(--input-border-light);
    }
  }
}

.segmented-control input:checked + label {
  background: var(--highlight-color);
  color: white;
  cursor: default;
}
</style>
