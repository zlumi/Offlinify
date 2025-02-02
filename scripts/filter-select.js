function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(params.entries());
}

const { references } = getQueryParams();
const referencesList = document.getElementById("references");
if (references) {
  const refs = JSON.parse(decodeURIComponent(references));
  const domainMap = {};

  refs.forEach((ref) => {
    const url = new URL(ref);
    const domain = url.hostname;
    const path = url.pathname + url.search + url.hash;
    if (!domainMap[domain]) {
      domainMap[domain] = [];
    }
    domainMap[domain].push({ ref, path });
  });

  Object.keys(domainMap).forEach((domain) => {
    const domainDiv = document.createElement("div");
    domainDiv.classList.add("domain");
    domainDiv.textContent = domain;

    const linksDiv = document.createElement("div");
    linksDiv.classList.add("links");

    domainMap[domain].forEach((item) => {
      const link = document.createElement("a");
      link.href = item.ref;
      link.textContent = item.path;
      linksDiv.appendChild(link);
    });

    domainDiv.addEventListener("click", () => {
      const isExpanded = linksDiv.style.display === "block";
      linksDiv.style.display = isExpanded ? "none" : "block";
    });

    referencesList.appendChild(domainDiv);
    referencesList.appendChild(linksDiv);
  });
  filterLinks(document.getElementById("filter").value.toLowerCase());
}

function filterLinks(query) {
  const links = document.querySelectorAll("#references .links a");
  const domains = document.querySelectorAll("#references .domain");

  links.forEach((link) => {
    if (link.href.toLowerCase().includes(query)) {
      link.classList.add("covered");
    } else {
      link.classList.remove("covered");
    }
  });

  domains.forEach((domain) => {
    const linksDiv = domain.nextElementSibling;
    const domainLinks = linksDiv.querySelectorAll("a");
    const coveredLinks = linksDiv.querySelectorAll("a.covered");

    domain.classList.remove("covered");
    domain.classList.remove("partially-covered");
    if (coveredLinks.length === domainLinks.length) {
      domain.classList.add("covered");
    } else if (coveredLinks.length > 0) {
      domain.classList.add("partially-covered");
    }
  });
}

document.getElementById("filter").addEventListener("input", function () {
  filterLinks(this.value.toLowerCase());
});

document.getElementById("filter").addEventListener("keypress", function (event) {
  if (event.key === "Enter") {
    const filter = this.value.toLowerCase();
    chrome.runtime.sendMessage({ filter }, () => {
      window.close();
    });
  }
});