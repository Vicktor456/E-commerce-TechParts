const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require(path.join(process.env.POC_TOOLS, "node_modules/jsdom"));
const settings = JSON.parse(process.env.POC_SETTINGS);
const html = fs.readFileSync("dist/index.html", "utf8");
const bundle = fs.readFileSync("dist" + html.match(/src="([^"]+\.js)"/)[1], "utf8");
const screens = [];

function mount() {
  const dom = new JSDOM(html, { url: settings.baseUrl + "/#catalogo", runScripts: "outside-only" });
  let cookie = "";
  const requests = [];
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.fetch = async (resource, options) => {
    const headers = new Headers(options?.headers);
    if (cookie) headers.set("Cookie", cookie);
    const response = await fetch(new URL(resource, settings.baseUrl), { ...options, headers });
    requests.push({ resource, method: options?.method ?? "GET", status: response.status });
    const value = response.headers.get("Set-Cookie");
    if (value) cookie = value.split(";", 1)[0];
    return response;
  };
  dom.window.eval(bundle);
  return { dom, requests };
}

async function until(find, label) {
  for (let attempt = 0; attempt < 160; attempt++) {
    const result = find();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
  throw new Error("Tela ou estado não encontrado: " + label);
}

function value(dom, field, text) {
  assert(field, "Campo do formulário");
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value").set.call(field, text);
  const event = field.tagName === "SELECT" ? "change" : "input";
  field.dispatchEvent(new dom.window.Event(event, { bubbles: true }));
}

function button(doc, label) {
  return [...doc.querySelectorAll("button")].find((item) => item.textContent.trim() === label);
}

async function login(dom, email, password) {
  const doc = dom.window.document;
  dom.window.location.hash = "login";
  const form = await until(() => doc.querySelector(".auth-card form"), "Login");
  value(dom, form.querySelector('[type="email"]'), email);
  value(dom, form.querySelector('[type="password"]'), password);
  form.querySelector('[type="submit"]').click();
}

async function customerFlow() {
  const { dom } = mount();
  const doc = dom.window.document;
  try {
    await until(() => doc.querySelectorAll(".product-card").length === 9, "Catálogo");
    const first = doc.querySelector(".product-name").textContent;
    doc.querySelector('[aria-label="Próxima página"]').click();
    await until(() => doc.querySelector('[aria-current="page"]')?.textContent === "Página 2"
      && doc.querySelector(".product-name")?.textContent !== first, "Próxima página por cursor");
    doc.querySelector('[aria-label="Página anterior"]').click();
    await until(() => doc.querySelector(".product-name")?.textContent === first, "Página anterior");
    screens.push("Catálogo");
    dom.window.location.hash = "produto/1";
    await until(() => doc.querySelector(".detail-history tbody tr"), "Detalhes e histórico");
    screens.push("Detalhes do produto");

    dom.window.location.hash = "cadastro";
    const register = await until(() => doc.querySelector(".auth-card form"), "Cadastro");
    value(dom, register.querySelector('[autocomplete="name"]'), "Cliente da interface");
    value(dom, register.querySelector('[type="email"]'), settings.uiEmail);
    value(dom, register.querySelector('[type="password"]'), settings.customerPassword);
    register.querySelector('[type="submit"]').click();
    await until(() => doc.querySelector(".auth-success"), "Cadastro confirmado");
    screens.push("Cadastro de cliente");

    await login(dom, settings.uiEmail, settings.customerPassword);
    await until(() => !doc.querySelector(".auth-card") && dom.window.location.hash === "#catalogo",
      "Login confirmado");
    screens.push("Login");
    dom.window.location.hash = "produto/1";
    const add = await until(() => {
      const target = button(doc, "Adicionar ao carrinho");
      return target && !target.disabled && target;
    }, "Adicionar ao carrinho");
    add.click();
    await until(() => dom.window.location.hash === "#carrinho" && doc.querySelector(".cart-item"), "Carrinho");
    assert.match(doc.querySelector(".cart-item").textContent, /899,90/);
    screens.push("Meu carrinho");
  } finally {
    dom.window.close();
  }
}

async function adminFlow() {
  const { dom, requests } = mount();
  const doc = dom.window.document;
  const name = "Mouse da interface PoC";
  try {
    await login(dom, settings.adminEmail, settings.adminPassword);
    const create = await until(() => button(doc, "Novo produto"), "Gerenciar produtos");
    screens.push("Gerenciar produtos");
    create.click();
    const form = await until(() => doc.querySelector(".product-form"), "Formulário de produto");
    value(dom, form.querySelector('input'), name);
    value(dom, form.querySelector('textarea'), "Cadastro pela interface");
    value(dom, form.querySelector('[placeholder="Ex.: ASUS"]'), "TechParts");
    value(dom, form.querySelector('select'), "Mouses");
    value(dom, form.querySelector('input[type=number]'), "59.90");
    form.querySelector('[type=submit]').click();
    const edit = await until(() => doc.querySelector('[aria-label="Editar ' + name + '"]'), "Produto salvo");
    edit.click();
    const price = await until(() => doc.querySelector(".product-form input[type=number]"), "Editar produto");
    assert.equal(price.value, "59.9");
    value(dom, price, "69.90");
    price.form.querySelector('[type=submit]').click();
    await until(() => [...doc.querySelectorAll("tbody tr")].some(
      (row) => row.textContent.includes(name) && row.textContent.includes("69,90")), "Preço alterado");
    screens.push("Cadastrar ou editar produto");

    const adminReads = () => requests.filter(({ resource, method, status }) =>
      resource === "/api/catalogo/admin/produtos" && method === "GET" && status === 200).length;
    const before = adminReads();
    dom.window.location.hash = "admin/estoque";
    await until(() => adminReads() > before, "Carregar o estoque atualizado");
    const stockSelector = '[aria-label="Estoque total de ' + name + '"]';
    const stock = await until(() => doc.querySelector(stockSelector), "Estoque");
    value(dom, stock, "2");
    stock.form.querySelector('[type=submit]').click();
    await until(() => requests.some(({ resource, method, status }) =>
      resource.startsWith("/api/estoque/") && method === "PUT" && status === 200), "Estoque salvo pela API");
    await until(() => doc.querySelector(stockSelector)?.closest("tr")?.cells[1].textContent === "2",
      "Estoque atualizado na tabela");
    screens.push("Gerenciar estoque");
  } finally {
    dom.window.close();
  }
}

(async () => {
  await customerFlow();
  await adminFlow();
  assert.equal(screens.length, 8);
  console.log("Telas verificadas: " + screens.join(", "));
})().catch((error) => { console.error(error); process.exitCode = 1; });
