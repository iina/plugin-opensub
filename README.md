# IINA Plugin for opensubtitles.com

Read the [plugin documentation](https://docs.iina.io/modules.html) before starting.

## Install from IINA

Choose "Install from GitHub" and enter `iina/plugin-opensub`.
Alternatively, you can download the `iinaplgz` file from the latest release.

## Personal API key

By default, the plugin uses IINA's shared OpenSubtitles API key. To use your own,
obtain a key from your [OpenSubtitles API consumers](https://www.opensubtitles.com/en/consumers)
page, then choose **Plugins → OpenSubtitles → Personal API Key…** while a video
window is open. The key is stored in the system keychain, independently of the
login credential preference; only the enabled flag is stored in plugin settings.

The sidebar shows when a personal key is active. Requests wait until the key has
loaded. If a selected key cannot be read, the plugin reports that problem instead
of silently using the shared key. Changing keys clears the saved login identity
and reloads the sidebar, since sessions from the previous key should not be reused.

To use IINA's shared key again, leave the key field blank. This disables the
personal key; the saved Keychain item is retained. A personal key does not sign
you in or resolve OpenSubtitles authentication errors. Anonymous downloads remain
subject to OpenSubtitles' limits.

## Build

```bash
npm install
npm run build
```

## Load locally

```
iina-plugin link .
```
