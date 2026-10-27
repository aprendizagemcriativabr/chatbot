const OPTIONS_MAX = 100;
const QUESTION_TYPES = ["text", "single_choice", "multiple_choice"];
const TYPE_LABELS = {
  text: "Texto",
  single_choice: "Opção única",
  multiple_choice: "Opção múltipla",
};

const questionsListElement = document.getElementById("questions-list");
const addButton = document.getElementById("add-button");
const saveButton = document.getElementById("save-button");
const reloadButton = document.getElementById("reload-button");
const feedbackElement = document.getElementById("feedback");
const { parseJsonSafely, redirectToLoginSoon, shouldRedirectToLogin } = window.adminShared;

let questions = [];

function showFeedback(message, isError = false) {
  feedbackElement.textContent = message;
  feedbackElement.classList.remove("hidden", "ok", "err");
  feedbackElement.classList.add(isError ? "err" : "ok");
}

function clearFeedback() {
  feedbackElement.classList.add("hidden");
}

function setButtonsLoading(isLoading) {
  saveButton.disabled = isLoading;
  reloadButton.disabled = isLoading;
  addButton.disabled = isLoading;
  saveButton.textContent = isLoading ? "Salvando..." : "Salvar";
}

function normalizeQuestionType(type) {
  return QUESTION_TYPES.includes(type) ? type : "text";
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

function createInput(labelText, value, onInput) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";

  const label = document.createElement("label");
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "text";
  input.value = value ?? "";
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
    } else if (questions[index].options.length === 0) {
      questions[index].options = [""];
    }
    clearFeedback();
    renderQuestions();
  });

  wrapper.append(label, select);
  return wrapper;
}

function createRequiredToggle(question, index) {
  const wrapper = document.createElement("div");
  wrapper.className = "field checkbox-line";
  const id = `standalone-question-required-${index}`;

  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = "Obrigatória";

  const checkbox = document.createElement("input");
  checkbox.id = id;
  checkbox.type = "checkbox";
  checkbox.checked = Boolean(question.required);
  checkbox.addEventListener("change", (event) => {
    questions[index].required = event.target.checked;
    clearFeedback();
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
    row.className = "row wrap option-row";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Opção ${optionIndex + 1}`;
    input.value = option;
    input.addEventListener("input", (event) => {
      questions[questionIndex].options[optionIndex] = event.target.value;
      clearFeedback();
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "danger";
    removeButton.textContent = "Remover opção";
    removeButton.addEventListener("click", () => {
      questions[questionIndex].options.splice(optionIndex, 1);
      clearFeedback();
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
      showFeedback(`Limite de ${OPTIONS_MAX} opções por pergunta.`, true);
      return;
    }

    questions[questionIndex].options.push("");
    clearFeedback();
    renderQuestions();
  });

  const info = document.createElement("small");
  info.className = "muted";
  info.textContent = `${question.options.length}/${OPTIONS_MAX} opções`;

  configBox.append(list, addOptionButton, info);
  container.append(configBox);
}

function renderQuestions() {
  questionsListElement.innerHTML = "";

  if (questions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Nenhuma pergunta na lista.";
    questionsListElement.append(empty);
    return;
  }

  questions.forEach((question, index) => {
    const card = document.createElement("section");
    card.className = "question-card";

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
      clearFeedback();
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
      clearFeedback();
      renderQuestions();
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "danger";
    removeButton.textContent = "Remover";
    removeButton.addEventListener("click", () => {
      questions.splice(index, 1);
      clearFeedback();
      renderQuestions();
    });

    actions.append(upButton, downButton, removeButton);
    header.append(title, actions);

    const mainFields = document.createElement("div");
    mainFields.className = "question-grid";

    const titleField = createInput("Título", question.text, (event) => {
      questions[index].text = event.target.value;
      clearFeedback();
    });
    const typeSelect = createTypeSelect(question, index);
    const helperField = createInput("Texto de auxílio", question.helperText, (event) => {
      questions[index].helperText = event.target.value;
      clearFeedback();
    });
    const requiredToggle = createRequiredToggle(question, index);

    mainFields.append(titleField, typeSelect, helperField);
    card.append(header, mainFields, requiredToggle);
    renderOptions(card, question, index);
    questionsListElement.append(card);
  });
}

async function fetchQuestions() {
  const response = await fetch("/api/admin/questions", { method: "GET" });

  if (!response.ok) {
    if (response.status === 401) throw new Error("Sessão inválida. Faça login novamente.");
    throw new Error("Não foi possível carregar perguntas.");
  }

  const body = await response.json();
  if (!Array.isArray(body.questions)) throw new Error("Resposta inválida da API.");
  questions = body.questions.map((item) => toEditableQuestion(item));
  renderQuestions();
}

async function saveQuestions() {
  const payloadQuestions = [];

  for (let index = 0; index < questions.length; index += 1) {
    const validationError = validateQuestion(questions[index], index);
    if (validationError) throw new Error(validationError);
    payloadQuestions.push(buildPayloadQuestion(questions[index], index));
  }

  const response = await fetch("/api/admin/questions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ questions: payloadQuestions }),
  });

  if (response.ok) {
    const body = await response.json();
    questions = Array.isArray(body.questions) ? body.questions.map((item) => toEditableQuestion(item)) : questions;
    renderQuestions();
    showFeedback("Perguntas sincronizadas com sucesso.");
    return;
  }

  if (response.status === 401) throw new Error("Sessão inválida. Faça login novamente.");

  const body = await parseJsonSafely(response);
  if (response.status === 400 && body?.error === "duplicate orders in payload") {
    const duplicated = Array.isArray(body.duplicate_orders) ? body.duplicate_orders.join(", ") : "";
    throw new Error(`Existem ordens duplicadas: ${duplicated}`);
  }

  if (response.status === 502) throw new Error("Falha ao sincronizar perguntas com o backend. Tente novamente.");
  throw new Error("Falha ao salvar perguntas.");
}

addButton.addEventListener("click", () => {
  questions.push(createDefaultQuestion());
  clearFeedback();
  renderQuestions();
});

saveButton.addEventListener("click", async () => {
  clearFeedback();
  setButtonsLoading(true);

  try {
    await saveQuestions();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao salvar.";
    showFeedback(message, true);
    if (shouldRedirectToLogin(message)) redirectToLoginSoon();
  } finally {
    setButtonsLoading(false);
  }
});

reloadButton.addEventListener("click", async () => {
  clearFeedback();
  setButtonsLoading(true);

  try {
    await fetchQuestions();
    showFeedback("Perguntas recarregadas com sucesso.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao recarregar.";
    showFeedback(message, true);
    if (shouldRedirectToLogin(message)) redirectToLoginSoon();
  } finally {
    setButtonsLoading(false);
  }
});

fetchQuestions().catch((error) => {
  const message = error instanceof Error ? error.message : "Erro inesperado ao carregar.";
  showFeedback(message, true);
  if (shouldRedirectToLogin(message)) redirectToLoginSoon();
});
