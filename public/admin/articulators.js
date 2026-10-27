const rowsElement = document.getElementById("rows");
const addForm = document.getElementById("add-form");
const saveButton = document.getElementById("save-button");
const reloadButton = document.getElementById("reload-button");
const feedbackElement = document.getElementById("feedback");
const nameInput = document.getElementById("name");
const phoneInput = document.getElementById("phone");
const { parseJsonSafely, redirectToLoginSoon, shouldRedirectToLogin } = window.adminShared;

let articulators = [];

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
  saveButton.textContent = isLoading ? "Salvando..." : "Salvar";
}

function renderTable() {
  rowsElement.innerHTML = "";

  if (articulators.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.textContent = "Nenhum articulador na lista.";
    row.append(cell);
    rowsElement.append(row);
    return;
  }

  articulators.forEach((item, index) => {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    const phoneCell = document.createElement("td");
    const actionCell = document.createElement("td");
    const removeButton = document.createElement("button");

    nameCell.textContent = item.name;
    phoneCell.textContent = item.phone;
    removeButton.className = "danger";
    removeButton.type = "button";
    removeButton.textContent = "Remover";
    removeButton.setAttribute("data-remove-index", String(index));

    actionCell.append(removeButton);
    row.append(nameCell, phoneCell, actionCell);
    rowsElement.append(row);
  });
}

function normalizePhone(rawPhone) {
  return rawPhone.replace(/\D/g, "");
}

function validateArticulator(item) {
  if (!item.name.trim()) {
    return "Nome é obrigatório.";
  }

  if (!item.phone.trim()) {
    return "Telefone é obrigatório.";
  }

  return "";
}

async function fetchArticulators() {
  const response = await fetch("/api/admin/articulators", {
    method: "GET",
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Sessão inválida. Faça login novamente.");
    }

    throw new Error("Não foi possível carregar articuladores.");
  }

  const body = await response.json();

  if (!Array.isArray(body.articulators)) {
    throw new Error("Resposta inválida da API.");
  }

  articulators = body.articulators;
  renderTable();
}

async function saveArticulators() {
  const response = await fetch("/api/admin/articulators", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ articulators }),
  });

  if (response.ok) {
    const body = await response.json();
    articulators = Array.isArray(body.articulators) ? body.articulators : articulators;
    renderTable();
    showFeedback("Lista sincronizada com sucesso.");
    return;
  }

  if (response.status === 401) {
    throw new Error("Sessão inválida. Faça login novamente.");
  }

  if (response.status === 400) {
    const body = await parseJsonSafely(response);

    if (body?.error === "duplicate phones in payload") {
      const duplicated = Array.isArray(body.duplicate_phones)
        ? body.duplicate_phones.join(", ")
        : "";
      throw new Error(`Existem telefones duplicados no payload: ${duplicated}`);
    }

    throw new Error("Payload inválido. Revise os dados e tente novamente.");
  }

  throw new Error("Falha ao salvar articuladores.");
}

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearFeedback();

  const candidate = {
    name: nameInput.value.trim(),
    phone: normalizePhone(phoneInput.value),
  };

  const validationError = validateArticulator(candidate);
  if (validationError) {
    showFeedback(validationError, true);
    return;
  }

  articulators.push(candidate);
  renderTable();
  addForm.reset();
});

rowsElement.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const removeIndexText = target.getAttribute("data-remove-index");

  if (removeIndexText === null) {
    return;
  }

  const removeIndex = Number.parseInt(removeIndexText, 10);

  if (Number.isNaN(removeIndex)) {
    return;
  }

  articulators.splice(removeIndex, 1);
  renderTable();
  clearFeedback();
});

saveButton.addEventListener("click", async () => {
  clearFeedback();

  for (const item of articulators) {
    const validationError = validateArticulator(item);

    if (validationError) {
      showFeedback(validationError, true);
      return;
    }
  }

  try {
    setButtonsLoading(true);
    await saveArticulators();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao salvar.";
    showFeedback(message, true);

    if (shouldRedirectToLogin(message)) {
      redirectToLoginSoon();
    }
  } finally {
    setButtonsLoading(false);
  }
});

reloadButton.addEventListener("click", async () => {
  clearFeedback();

  try {
    setButtonsLoading(true);
    await fetchArticulators();
    showFeedback("Lista recarregada com sucesso.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao recarregar.";
    showFeedback(message, true);

    if (shouldRedirectToLogin(message)) {
      redirectToLoginSoon();
    }
  } finally {
    setButtonsLoading(false);
  }
});

(async () => {
  try {
    await fetchArticulators();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao carregar.";
    showFeedback(message, true);

    if (shouldRedirectToLogin(message)) {
      redirectToLoginSoon();
    }
  }
})();
