const { console } = iina;
console.log("Plugin is running");

function openSubLogin(username, password) {
  const opensub = new OpenSubtitles();
  opensub.login(username, password).then((res) => {
    console.log(res);
  });
}
