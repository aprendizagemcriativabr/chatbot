(function bootstrapAdminPanel() {
  const OPTIONS_MAX = 100;
  const QUESTION_TYPES = ["text", "single_choice", "multiple_choice"];
  const TYPE_LABELS = {
    text: "Texto",
    single_choice: "Opção única",
    multiple_choice: "Opção múltipla",
  };

  const parseJsonSafely = window.adminShared?.parseJsonSafely ?? ((response) => response.json().catch(() => null));
  const redirectToLoginSoon = window.adminShared?.redirectToLoginSoon ?? (() => window.location.replace("/admin"));
  const shouldRedirectToLogin =
    window.adminShared?.shouldRedirectToLogin ??
    ((message) => typeof message === "string" && message.includes("Faça login novamente"));

  const elements = {
    navItems: [...document.querySelectorAll("[data-page]")],
    pages: [...document.querySelectorAll(".page")],
    logoutButton: document.getElementById("logout-button"),
    dashboardReloadButton: document.getElementById("dashboard-reload-button"),
    statArticulators: document.getElementById("stat-articulators"),
    statQuestions: document.getElementById("stat-questions"),
    lastSyncLabel: document.getElementById("last-sync-label"),
    activityLog: document.getElementById("activity-log"),
    articulatorForm: document.getElementById("articulator-add-form"),
    articulatorName: document.getElementById("articulator-name"),
    articulatorPhone: document.getElementById("articulator-phone"),
    articulatorsRows: document.getElementById("articulators-rows"),
    articulatorsCount: document.getElementById("articulators-count"),
    articulatorsReloadButton: document.getElementById("articulators-reload-button"),
    articulatorsSaveButton: document.getElementById("articulators-save-button"),
    articulatorsFeedback: document.getElementById("articulators-feedback"),
    questionsList: document.getElementById("questions-list"),
    questionsCount: document.getElementById("questions-count"),
    questionsAddButton: document.getElementById("questions-add-button"),
    questionsReloadButton: document.getElementById("questions-reload-button"),
    questionsSaveButton: document.getElementById("questions-save-button"),
    questionsFeedback: document.getElementById("questions-feedback"),
  };

  const loadedPages = new Set();
  let activePage = "dashboard";
  let articulators = [];
  let questions = [];

  function nowLabel() {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());
  }

  function addLog(message, variant = "default") {
    if (!elements.activityLog) return;

    if (elements.activityLog.children.length === 1 && elements.activityLog.textContent.includes("Nenhuma atividade")) {
      elements.activityLog.innerHTML = "";
    }

    const line = document.createElement("div");
    line.className = `log-line ${variant}`;

    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = nowLabel();

    line.append(time, document.createTextNode(message));
    elements.activityLog.prepend(line);
  }

  function showFeedback(element, message, isError = false) {
    element.textContent = message;
    element.classList.remove("hidden", "ok", "err");
    element.classList.add(isError ? "err" : "ok");
  }

  function clearFeedback(element) {
    element.classList.add("hidden");
  }

  function handleError(error, feedbackElement, fallbackMessage = "Erro inesperado.") {
    const message = error instanceof Error ? error.message : fallbackMessage;
    showFeedback(feedbackElement, message, true);

    if (shouldRedirectToLogin(message)) {
      redirectToLoginSoon();
    }
  }

  async function readJson(response) {
    if (response.status === 204) return null;
    return parseJsonSafely(response);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
    });

    const body = await readJson(response);
    if (response.ok) return body;

    if (response.status === 401) {
      throw new Error("Sessão inválida. Faça login novamente.");
    }

    const errorMessage = body && typeof body.error === "string" ? body.error : "Erro na requisição.";
    const error = new Error(errorMessage);
    error.response = body;
    error.status = response.status;
    throw error;
  }

  function updateDashboardStats() {
    elements.statArticulators.textContent = String(articulators.length || 0);
    elements.statQuestions.textContent = String(questions.length || 0);
    elements.lastSyncLabel.textContent = `Atualizado às ${nowLabel()}`;
  }

  function initialPageFromLocation() {
    const hashPage = window.location.hash.replace("#", "");
    if (["dashboard", "articulators", "questions"].includes(hashPage)) return hashPage;
    if (window.location.pathname.endsWith("/articulators")) return "articulators";
    if (window.location.pathname.endsWith("/questions")) return "questions";
    return "dashboard";
  }

  function setPage(page) {
    activePage = page;
    elements.pages.forEach((item) => {
      item.classList.toggle("active", item.id === `page-${page}`);
    });
    elements.navItems.forEach((item) => {
      item.classList.toggle("active", item.dataset.page === page);
    });

    if (window.location.hash !== `#${page}`) {
      window.history.replaceState(null, "", `${window.location.pathname}#${page}`);
    }

    loadPage(page).catch((error) => {
      const feedbackElement = page === "articulators" ? elements.articulatorsFeedback : elements.questionsFeedback;
      if (page === "dashboard") {
        addLog("Falha ao carregar dados do painel.", "err");
        if (error instanceof Error && shouldRedirectToLogin(error.message)) redirectToLoginSoon();
        return;
      }
      handleError(error, feedbackElement, "Erro inesperado ao carregar dados.");
    });
  }

  async function loadPage(page) {
    if (page === "dashboard") {
      await loadDashboard();
      return;
    }

    if (page === "articulators" && !loadedPages.has("articulators")) {
      await loadArticulators();
      return;
    }

    if (page === "questions") {
      if (!loadedPages.has("questions")) {
        await loadQuestions();
      } else {
        renderQuestions();
      }
    }
  }

  async function loadDashboard() {
    const results = await Promise.allSettled([
      loadArticulators({ silent: true }),
      loadQuestions({ silent: true }),
    ]);

    updateDashboardStats();
    const rejected = results.find((item) => item.status === "rejected");
    if (rejected) {
      addLog("Falha ao atualizar parte do dashboard.", "err");
      if (rejected.reason instanceof Error && shouldRedirectToLogin(rejected.reason.message)) {
        redirectToLoginSoon();
      }
      return;
    }

    addLog("Dashboard atualizado.", "ok");
  }

  function normalizePhone(rawPhone) {
    return rawPhone.replace(/\D/g, "");
  }

  function validateArticulator(item) {
    if (!item.name.trim()) return "Nome é obrigatório.";
    if (!item.phone.trim()) return "Telefone é obrigatório.";
    return "";
  }

  function renderArticulators() {
    elements.articulatorsRows.innerHTML = "";
    elements.articulatorsCount.textContent = `${articulators.length} ${articulators.length === 1 ? "item" : "itens"}`;
    updateDashboardStats();

    if (articulators.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 3;
      cell.className = "muted";
      cell.textContent = "Nenhum articulador cadastrado.";
      row.append(cell);
      elements.articulatorsRows.append(row);
      return;
    }

    articulators.forEach((item, index) => {
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      const phoneCell = document.createElement("td");
      const actionCell = document.createElement("td");
      const removeButton = document.createElement("button");

      nameCell.textContent = item.name;
      phoneCell.className = "td-mono";
      phoneCell.textContent = item.phone;
      removeButton.className = "danger";
      removeButton.type = "button";
      removeButton.textContent = "Remover";
      removeButton.addEventListener("click", () => {
        articulators.splice(index, 1);
        clearFeedback(elements.articulatorsFeedback);
        renderArticulators();
      });

      actionCell.append(removeButton);
      row.append(nameCell, phoneCell, actionCell);
      elements.articulatorsRows.append(row);
    });
  }

  function setArticulatorsLoading(isLoading) {
    elements.articulatorsSaveButton.disabled = isLoading;
    elements.articulatorsReloadButton.disabled = isLoading;
    elements.articulatorsSaveButton.textContent = isLoading ? "Salvando" : "Salvar";
  }

  async function loadArticulators(options = {}) {
    if (!options.silent) {
      clearFeedback(elements.articulatorsFeedback);
      setArticulatorsLoading(true);
    }

    try {
      const body = await api("/api/admin/articulators", { method: "GET" });
      if (!Array.isArray(body?.articulators)) throw new Error("Resposta inválida da API.");
      articulators = body.articulators;
      loadedPages.add("articulators");
      renderArticulators();
      if (!options.silent) {
        showFeedback(elements.articulatorsFeedback, "Articuladores recarregados.");
        addLog("Articuladores recarregados.", "ok");
      }
    } finally {
      if (!options.silent) setArticulatorsLoading(false);
    }
  }

  async function saveArticulators() {
    clearFeedback(elements.articulatorsFeedback);

    for (const item of articulators) {
      const validationError = validateArticulator(item);
      if (validationError) {
        showFeedback(elements.articulatorsFeedback, validationError, true);
        return;
      }
    }

    setArticulatorsLoading(true);

    try {
      const body = await api("/api/admin/articulators", {
        method: "POST",
        body: JSON.stringify({ articulators }),
      });

      articulators = Array.isArray(body?.articulators) ? body.articulators : articulators;
      renderArticulators();
      showFeedback(elements.articulatorsFeedback, "Lista sincronizada com sucesso.");
      addLog("Lista de articuladores sincronizada.", "ok");
    } catch (error) {
      if (error.status === 400 && error.response?.error === "duplicate phones in payload") {
        const duplicated = Array.isArray(error.response.duplicate_phones)
          ? error.response.duplicate_phones.join(", ")
          : "";
        handleError(new Error(`Existem telefones duplicados: ${duplicated}`), elements.articulatorsFeedback);
        return;
      }

      handleError(error, elements.articulatorsFeedback, "Erro inesperado ao salvar articuladores.");
    } finally {
      setArticulatorsLoading(false);
    }
  }

  function createDefaultQuestion() {
    return {
      text: "",
      type: "text",
      helperText: "",
      required: true,
      options: [],
    };
  }

  function normalizeQuestionType(type) {
    return QUESTION_TYPES.includes(type) ? type : "text";
  }

  function toEditableQuestion(question) {
    const type = normalizeQuestionType(question?.type);
    const rawOptions = Array.isArray(question?.options) ? question.options : [];

    return {
      text: typeof question?.text === "string" ? question.text : "",
      type,
      helperText: typeof question?.helperText === "string" ? question.helperText : "",
      required: question?.required !== false,
      options: type === "text" ? [] : rawOptions.map((option) => String(option ?? "")),
    };
  }

  function normalizeOptionValue(raw, fallbackIndex) {
    const normalized = String(raw || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_");

    return normalized || `opcao_${fallbackIndex + 1}`;
  }

  function isChoiceType(type) {
    return type === "single_choice" || type === "multiple_choice";
  }

  function validateQuestion(question, index) {
    if (!question.text.trim()) return `Pergunta ${index + 1}: título é obrigatório.`;
    if (!QUESTION_TYPES.includes(question.type)) return `Pergunta ${index + 1}: tipo inválido.`;
    if (!isChoiceType(question.type)) return "";

    const options = question.options.map((option) => option.trim()).filter(Boolean);
    if (options.length === 0) return `Pergunta ${index + 1}: adicione pelo menos uma opção.`;
    if (options.length > OPTIONS_MAX) return `Pergunta ${index + 1}: limite de ${OPTIONS_MAX} opções excedido.`;

    const values = new Set();
    for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
      const value = normalizeOptionValue(options[optionIndex], optionIndex);
      if (values.has(value)) return `Pergunta ${index + 1}: opções com nomes geram IDs duplicados.`;
      values.add(value);
    }

    return "";
  }

  function buildPayloadQuestion(question, index) {
    const payload = {
      text: question.text.trim(),
      type: question.type,
      required: Boolean(question.required),
      order: index + 1,
    };

    const helperText = question.helperText.trim();
    if (helperText) payload.helperText = helperText;

    if (isChoiceType(question.type)) {
      payload.options = question.options.map((option) => option.trim()).filter(Boolean);
    }

    return payload;
  }

  function createInput(labelText, value, onInput, props = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const label = document.createElement("label");
    label.textContent = labelText;

    const input = document.createElement("input");
    input.type = props.type || "text";
    input.value = value ?? "";
    if (props.placeholder) input.placeholder = props.placeholder;
    input.addEventListener("input", onInput);

    wrapper.append(label, input);
    return wrapper;
  }

  function createTypeSelect(question, index) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const label = document.createElement("label");
    label.textContent = "Tipo";

    const select = document.createElement("select");
    QUESTION_TYPES.forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = TYPE_LABELS[type];
      if (question.type === type) option.selected = true;
      select.append(option);
    });

    select.addEventListener("change", (event) => {
      const nextType = normalizeQuestionType(event.target.value);
      questions[index].type = nextType;
      if (nextType === "text") {
        questions[index].options = [];
      } else if (!Array.isArray(questions[index].options) || questions[index].options.length === 0) {
        questions[index].options = [""];
      }
      clearFeedback(elements.questionsFeedback);
      renderQuestions();
    });

    wrapper.append(label, select);
    return wrapper;
  }

  function createRequiredToggle(question, index) {
    const wrapper = document.createElement("div");
    wrapper.className = "field checkbox-line";
    const id = `question-required-${index}`;

    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = "Obrigatória";

    const checkbox = document.createElement("input");
    checkbox.id = id;
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(question.required);
    checkbox.addEventListener("change", (event) => {
      questions[index].required = event.target.checked;
      clearFeedback(elements.questionsFeedback);
    });

    wrapper.append(label, checkbox);
    return wrapper;
  }

  function renderOptions(container, question, questionIndex) {
    if (!isChoiceType(question.type)) return;

    const configBox = document.createElement("div");
    configBox.className = "question-config";

    const list = document.createElement("div");
    list.className = "option-list";

    question.options.forEach((option, optionIndex) => {
      const row = document.createElement("div");
      row.className = "row option-row";

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = `Opção ${optionIndex + 1}`;
      input.value = option;
      input.addEventListener("input", (event) => {
        questions[questionIndex].options[optionIndex] = event.target.value;
        clearFeedback(elements.questionsFeedback);
      });

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "danger";
      removeButton.textContent = "Remover opção";
      removeButton.addEventListener("click", () => {
        questions[questionIndex].options.splice(optionIndex, 1);
        clearFeedback(elements.questionsFeedback);
        renderQuestions();
      });

      row.append(input, removeButton);
      list.append(row);
    });

    const addOptionButton = document.createElement("button");
    addOptionButton.type = "button";
    addOptionButton.className = "secondary";
    addOptionButton.textContent = "Adicionar opção";
    addOptionButton.disabled = question.options.length >= OPTIONS_MAX;
    addOptionButton.addEventListener("click", () => {
      if (questions[questionIndex].options.length >= OPTIONS_MAX) {
        showFeedback(elements.questionsFeedback, `Limite de ${OPTIONS_MAX} opções por pergunta.`, true);
        return;
      }

      questions[questionIndex].options.push("");
      clearFeedback(elements.questionsFeedback);
      renderQuestions();
    });

    const info = document.createElement("small");
    info.className = "muted";
    info.textContent = `${question.options.length}/${OPTIONS_MAX} opções`;

    configBox.append(list, addOptionButton, info);
    container.append(configBox);
  }

  function renderQuestions() {
    elements.questionsList.innerHTML = "";
    elements.questionsCount.textContent = `${questions.length} ${questions.length === 1 ? "item" : "itens"}`;
    updateDashboardStats();

    if (questions.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Nenhuma pergunta cadastrada.";
      elements.questionsList.append(empty);
      return;
    }

    questions.forEach((question, index) => {
      const card = document.createElement("section");
      card.className = "question-card question-card-simple";

      const header = document.createElement("div");
      header.className = "row wrap row-between";

      const title = document.createElement("h2");
      title.textContent = `Pergunta ${index + 1}`;

      const actions = document.createElement("div");
      actions.className = "row wrap";

      const upButton = document.createElement("button");
      upButton.type = "button";
      upButton.className = "secondary";
      upButton.textContent = "Subir";
      upButton.disabled = index === 0;
      upButton.addEventListener("click", () => {
        const previous = questions[index - 1];
        questions[index - 1] = questions[index];
        questions[index] = previous;
        clearFeedback(elements.questionsFeedback);
        renderQuestions();
      });

      const downButton = document.createElement("button");
      downButton.type = "button";
      downButton.className = "secondary";
      downButton.textContent = "Descer";
      downButton.disabled = index === questions.length - 1;
      downButton.addEventListener("click", () => {
        const next = questions[index + 1];
        questions[index + 1] = questions[index];
        questions[index] = next;
        clearFeedback(elements.questionsFeedback);
        renderQuestions();
      });

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "danger";
      removeButton.textContent = "Remover";
      removeButton.addEventListener("click", () => {
        questions.splice(index, 1);
        clearFeedback(elements.questionsFeedback);
        renderQuestions();
      });

      actions.append(upButton, downButton, removeButton);
      header.append(title, actions);

      const mainFields = document.createElement("div");
      mainFields.className = "question-grid";

      const titleField = createInput("Título", question.text, (event) => {
        questions[index].text = event.target.value;
        clearFeedback(elements.questionsFeedback);
      });

      const typeSelect = createTypeSelect(question, index);
      const helperField = createInput("Texto de auxílio", question.helperText, (event) => {
        questions[index].helperText = event.target.value;
        clearFeedback(elements.questionsFeedback);
      });
      const requiredToggle = createRequiredToggle(question, index);

      mainFields.append(titleField, typeSelect, helperField);
      card.append(header, mainFields, requiredToggle);
      renderOptions(card, question, index);
      elements.questionsList.append(card);
    });
  }

  function setQuestionsLoading(isLoading) {
    elements.questionsSaveButton.disabled = isLoading;
    elements.questionsReloadButton.disabled = isLoading;
    elements.questionsAddButton.disabled = isLoading;
    elements.questionsSaveButton.textContent = isLoading ? "Salvando" : "Salvar";
  }

  async function loadQuestions(options = {}) {
    if (!options.silent) {
      clearFeedback(elements.questionsFeedback);
      setQuestionsLoading(true);
    }

    try {
      const body = await api("/api/admin/questions", { method: "GET" });
      if (!Array.isArray(body?.questions)) throw new Error("Resposta inválida da API.");
      questions = body.questions.map((item) => toEditableQuestion(item));
      loadedPages.add("questions");
      renderQuestions();
      if (!options.silent) {
        showFeedback(elements.questionsFeedback, "Perguntas recarregadas.");
        addLog("Perguntas recarregadas.", "ok");
      }
    } finally {
      if (!options.silent) setQuestionsLoading(false);
    }
  }

  async function saveQuestions() {
    clearFeedback(elements.questionsFeedback);

    const payloadQuestions = [];
    for (let index = 0; index < questions.length; index += 1) {
      const validationError = validateQuestion(questions[index], index);
      if (validationError) {
        showFeedback(elements.questionsFeedback, validationError, true);
        return;
      }
      payloadQuestions.push(buildPayloadQuestion(questions[index], index));
    }

    setQuestionsLoading(true);

    try {
      const body = await api("/api/admin/questions", {
        method: "POST",
        body: JSON.stringify({ questions: payloadQuestions }),
      });

      questions = Array.isArray(body?.questions) ? body.questions.map((item) => toEditableQuestion(item)) : questions;
      renderQuestions();
      showFeedback(elements.questionsFeedback, "Perguntas sincronizadas com sucesso.");
      addLog("Perguntas sincronizadas com a API.", "ok");
    } catch (error) {
      if (error.status === 400 && error.response?.error === "duplicate orders in payload") {
        const duplicated = Array.isArray(error.response.duplicate_orders)
          ? error.response.duplicate_orders.join(", ")
          : "";
        handleError(new Error(`Existem ordens duplicadas: ${duplicated}`), elements.questionsFeedback);
        return;
      }

      if (error.status === 502) {
        handleError(new Error("Falha ao sincronizar perguntas com o backend. Tente novamente."), elements.questionsFeedback);
        return;
      }

      handleError(error, elements.questionsFeedback, "Erro inesperado ao salvar perguntas.");
    } finally {
      setQuestionsLoading(false);
    }
  }

  async function logout() {
    elements.logoutButton.disabled = true;
    try {
      await fetch("/admin/session", { method: "DELETE" });
    } finally {
      window.location.replace("/admin");
    }
  }

  elements.navItems.forEach((item) => {
    item.addEventListener("click", () => {
      setPage(item.dataset.page);
    });
  });

  elements.dashboardReloadButton.addEventListener("click", () => {
    loadedPages.clear();
    loadDashboard();
  });

  elements.logoutButton.addEventListener("click", logout);

  elements.articulatorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFeedback(elements.articulatorsFeedback);

    const candidate = {
      name: elements.articulatorName.value.trim(),
      phone: normalizePhone(elements.articulatorPhone.value),
    };

    const validationError = validateArticulator(candidate);
    if (validationError) {
      showFeedback(elements.articulatorsFeedback, validationError, true);
      return;
    }

    articulators.push(candidate);
    renderArticulators();
    elements.articulatorForm.reset();
  });

  elements.articulatorsReloadButton.addEventListener("click", async () => {
    try {
      await loadArticulators();
    } catch (error) {
      handleError(error, elements.articulatorsFeedback, "Erro inesperado ao recarregar articuladores.");
    }
  });

  elements.articulatorsSaveButton.addEventListener("click", saveArticulators);

  elements.questionsAddButton.addEventListener("click", () => {
    questions.push(createDefaultQuestion());
    clearFeedback(elements.questionsFeedback);
    renderQuestions();
  });

  elements.questionsReloadButton.addEventListener("click", async () => {
    try {
      await loadQuestions();
    } catch (error) {
      handleError(error, elements.questionsFeedback, "Erro inesperado ao recarregar perguntas.");
    }
  });

  elements.questionsSaveButton.addEventListener("click", saveQuestions);

  window.addEventListener("hashchange", () => {
    const page = initialPageFromLocation();
    if (page !== activePage) setPage(page);
  });

  renderArticulators();
  renderQuestions();
  setPage(initialPageFromLocation());
})();
