(function bootstrapAdminShared() {
  function redirectToLoginSoon() {
    setTimeout(() => {
      window.location.replace("/admin");
    }, 700);
  }

  function parseJsonSafely(response) {
    return response
      .json()
      .catch(() => null);
  }

  function shouldRedirectToLogin(message) {
    return typeof message === "string" && message.includes("Faça login novamente");
  }

  window.adminShared = {
    parseJsonSafely,
    redirectToLoginSoon,
    shouldRedirectToLogin,
  };
})();
