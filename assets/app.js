// Simple client-side app for GitHub Pages (Arabic, RTL)

const API = {
  search: async (q) => {
    const url = `https://ar.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("فشل البحث");
    const data = await res.json();
    return (data?.query?.search ?? []).map((s) => s.title);
  },
  summary: async (title) => {
    const url = `https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  },
  random: async () => {
    const url = `https://ar.wikipedia.org/api/rest_v1/page/random/summary`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  },
  trending: async () => {
    // Cache for 12h in localStorage
    const key = "trending_ar_v2";
    const cached = localStorage.getItem(key);
    if (cached) {
      try {
        const obj = JSON.parse(cached);
        if (Date.now() - obj.ts < 12 * 60 * 60 * 1000) {
          return obj.data;
        }
      } catch {}
    }
    const d = new Date();
    d.setUTCHours(0,0,0,0);
    d.setUTCDate(d.getUTCDate() - 1);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ar.wikipedia/all-access/${y}/${m}/${day}`;
    const res = await fetch(url);
    if (!res.ok) return { items: [], date: `${y}-${m}-${day}` };
    const data = await res.json();
    const raw = data?.items?.[0]?.articles ?? [];

    const isMetaNs = (t) => {
      const n = t.toLowerCase();
      return [
        "خاص:", "ملف:", "تصنيف:", "قالب:", "نقاش:", "بوابة:", "مساعدة:", "ويكيبيديا:", "مشروع:", "مستخدم:", "ملحق:",
        "special:", "file:", "category:", "template:", "talk:", "portal:", "help:", "wikipedia:", "user:"
      ].some((p) => n.startsWith(p));
    };

    const items = raw
      .filter((a) => a.article)
      .map((a) => decodeURIComponent(a.article))
      .filter((t) => !isMetaNs(t) && t !== "Main_Page" && t !== "الصفحة الرئيسية" && t !== "الصفحة_الرئيسية")
      .slice(0, 12)
      .map((t) => t.replaceAll("_", " "));
    const payload = { items, date: `${y}-${m}-${day}` };
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: payload })); } catch {}
    return payload;
  },
  geosearch: async (lat, lon, radius = 10000, limit = 40) => {
    const url = `https://ar.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${encodeURIComponent(
      `${lat}|${lon}`
    )}&gsradius=${radius}&gslimit=${limit}&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("فشل جلب الأماكن القريبة");
    const data = await res.json();
    return (data?.query?.geosearch ?? []).map((g) => ({
      title: g.title, lat: g.lat, lon: g.lon, pageid: g.pageid
    }));
  }
};

// Helpers
function qs(name, url) {
  if (!url) url = window.location.href;
  name = name.replace(/[[]]/g, "\\$&");
  const regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)");
  const results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return "";
  return decodeURIComponent(results[2].replace(/\+/g, " "));
}
function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v);
  });
  [].concat(children).filter(Boolean).forEach((c) => e.appendChild(c));
  return e;
}

// Haversine distance in meters
function distanceMeters(aLat, aLon, bLat, bLon) {
  const R = 6371e3, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return 2 * R * Math.asin(Math.sqrt(s));
}
function fmtDist(m) {
  if (m < 1000) return `${Math.round(m)} م`;
  return `${(m / 1000).toFixed(m < 5000 ? 1 : 0)} كم`;
}
const debounce = (fn, ms = 400) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.getAttribute("data-page");

  if (page === "home") {
    // Trending
    const trendingGrid = document.getElementById("trendingGrid");
    const trendingUpdated = document.getElementById("trendingUpdated");
    try {
      const { items, date } = await API.trending();
      if (trendingUpdated) trendingUpdated.textContent = `آخر تحديث: ${new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(new Date(date))}`;
      if (!items || items.length === 0) {
        trendingGrid.innerHTML = '<p class="muted">تعذّر جلب الشائع حاليًا.</p>';
      } else {
        trendingGrid.innerHTML = "";
        items.forEach((title) => {
          const link = el("a", { href: `./article.html?title=${encodeURIComponent(title)}`, class: "card" });
          link.textContent = title;
          trendingGrid.appendChild(link);
        });
      }
    } catch (e) {
      trendingGrid.innerHTML = '<p class="muted">حدث خطأ أثناء جلب الشائع.</p>';
    }

    // Random
    const randomCard = document.getElementById("randomCard");
    try {
      const s = await API.random();
      if (!s) throw new Error();
      const img = s?.thumbnail?.source
        ? el("img", { src: s.thumbnail.source, alt: "", class: "thumb", style: "width:96px;height:96px;" })
        : el("div", { class: "thumb" });
      const title = el("h3", { text: s.title });
      const extract = el("p", { class: "muted", text: s.extract || "" });
      const link = el("a", { href: `./article.html?title=${encodeURIComponent(s.title)}`, class: "btn-link" }, [el("span", { class: "icon icon-dice", "aria-hidden": "true" })]);
      link.appendChild(document.createTextNode(" افتح الملخص"));
      randomCard.append(img, el("div", {}, [title, extract, link]));
    } catch {
      randomCard.innerHTML = '<p class="muted">تعذّر جلب مقالة عشوائية.</p>';
    }
  }

  if (page === "search") {
    const q = (qs("q") || "").trim();
    const input = document.getElementById("qBox");
    if (input) input.value = q;
    const titleEl = document.getElementById("resultsTitle");
    const listEl = document.getElementById("resultsList");
    const noRes = document.getElementById("noResults");

    if (!q) {
      titleEl.textContent = "الرجاء إدخال عبارة للبحث";
      noRes.style.display = "block";
      return;
    }
    titleEl.textContent = `نتائج البحث عن “${q}”`;

    try {
      const titles = await API.search(q);
      const top = titles.slice(0, 12);
      if (top.length === 0) {
        noRes.style.display = "block";
        return;
      }
      const summaries = await Promise.all(top.map(API.summary));
      summaries.filter(Boolean).forEach((s) => {
        const img = s?.thumbnail?.source
          ? el("img", { src: s.thumbnail.source, alt: "", class: "thumb" })
          : el("div", { class: "thumb" });

        const h3 = el("h3", {}, [
          el("a", { href: `./article.html?title=${encodeURIComponent(s.title)}`, text: s.title })
        ]);
        const p = el("p", { class: "muted", text: s.extract || "" });

        const wikiUrl = s?.content_urls?.desktop?.page || `https://ar.wikipedia.org/wiki/${encodeURIComponent(s.title)}`;
        const links = el("p", {}, [
          el("a", { href: wikiUrl, target: "_blank", rel: "noopener", class: "btn-link" }, [
            el("span", { class: "icon icon-external", "aria-hidden": "true" }),
          ]),
          document.createTextNode(" فتح على ويكيبيديا")
        ]);

        const item = el("div", { class: "item" }, [
          img,
          el("div", {}, [h3, p, links])
        ]);
        listEl.appendChild(item);
      });
    } catch (e) {
      const err = el("p", { class: "muted", text: "حدث خطأ أثناء جلب النتائج." });
      listEl.appendChild(err);
    }
  }

  if (page === "article") {
    const title = qs("title");
    const titleEl = document.getElementById("articleTitle");
    const imgEl = document.getElementById("articleImg");
    const extractEl = document.getElementById("articleExtract");
    const linksEl = document.getElementById("articleLinks");

    if (!title) {
      titleEl.textContent = "تعذّر تحديد المقالة.";
      return;
    }

    try {
      const s = await API.summary(title);
      const displayTitle = s?.title || title;
      titleEl.textContent = displayTitle;
      if (s?.thumbnail?.source) {
        imgEl.src = s.thumbnail.source;
        imgEl.style.display = "block";
      }
      extractEl.textContent = s?.extract || "لا يوجد ملخص.";
      const wikiUrl = s?.content_urls?.desktop?.page || `https://ar.wikipedia.org/wiki/${encodeURIComponent(displayTitle)}`;
      const link = el("a", { href: wikiUrl, target: "_blank", rel: "noopener", class: "btn-link" }, [
        el("span", { class: "icon icon-external", "aria-hidden": "true" })
      ]);
      link.appendChild(document.createTextNode(" افتح على ويكيبيديا"));
      linksEl.appendChild(link);
    } catch {
      titleEl.textContent = title;
      extractEl.textContent = "تعذّر تحميل هذه المقالة.";
    }
  }

  if (page === "map") {
    // Parse hash: #z/lat/lon
    const parseHash = () => {
      const h = (location.hash || "").replace("#", "").split("/");
      const z = +h[0] || 12;
      const lat = +h[1] || 24.7136; // Default: Riyadh area
      const lon = +h[2] || 46.6753;
      return { z, lat, lon };
    };
    const writeHash = (z, lat, lon) => {
      const p = `#${Math.round(z * 100) / 100}/${lat.toFixed(4)}/${lon.toFixed(4)}`;
      if (location.hash !== p) history.replaceState(null, "", p);
    };

    // Init map
    const { z, lat, lon } = parseHash();
    const map = L.map("map", { zoomControl: true, attributionControl: true }).setView([lat, lon], z);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    const listEl = document.getElementById("nearbyList");
    const panel = document.getElementById("infoPanel");
    const panelBody = document.getElementById("panelBody");
    const closeBtn = document.getElementById("closePanel");

    const markers = new Map(); // title -> marker

    function clearMarkers() {
      markers.forEach((m) => map.removeLayer(m));
      markers.clear();
    }
    function selectMarker(title) {
      markers.forEach((m, t) => {
        const el = m.getElement();
        if (el) el.classList.toggle("selected", t === title);
      });
    }
    async function showPanel(summary) {
      panelBody.innerHTML = "";
      const title = document.createElement("h2");
      title.className = "panel-title";
      title.textContent = summary.title;

      if (summary.thumbnail?.source) {
        const img = document.createElement("img");
        img.className = "panel-img";
        img.src = summary.thumbnail.source;
        img.alt = "";
        panelBody.appendChild(img);
      }

      const p = document.createElement("p");
      p.textContent = summary.extract || "";

      const links = document.createElement("p");
      links.className = "panel-links";
      const wikiUrl = summary?.content_urls?.desktop?.page || `https://ar.wikipedia.org/wiki/${encodeURIComponent(summary.title)}`;
      const a = document.createElement("a");
      a.href = wikiUrl; a.target = "_blank"; a.rel = "noopener"; a.className = "btn-link";
      a.textContent = "افتح على ويكيبيديا";
      links.appendChild(a);

      panelBody.append(title, p, links);
      panel.hidden = false;
    }
    closeBtn.addEventListener("click", () => {
      panel.hidden = true;
      selectMarker(null);
    });

    // Haversine distance
    const loadNearby = debounce(async () => {
      const c = map.getCenter();
      const z = map.getZoom();
      writeHash(z, c.lat, c.lng);

      // Radius scales with zoom (heuristic)
      const radius = Math.max(500, 20000 / Math.pow(1.5, z - 10)); // meters
      listEl.innerHTML = '<p class="muted">جاري التحميل…</p>';

      try {
        const places = await API.geosearch(c.lat, c.lng, Math.round(radius), 40);
        const withDist = places
          .map((g) => ({ ...g, dist: distanceMeters(c.lat, c.lng, g.lat, g.lon) }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 20);

        const sums = await Promise.all(withDist.map((p) => API.summary(p.title)));
        clearMarkers();
        listEl.innerHTML = "";

        withDist.forEach((p, i) => {
          const s = sums[i];
          const marker = L.marker([p.lat, p.lon], {
            icon: L.divIcon({ className: "poi-marker", iconSize: [18, 18] })
          }).addTo(map);
          markers.set(p.title, marker);

          const openDetails = () => {
            selectMarker(p.title);
            if (s) showPanel(s);
          };
          marker.on("click", openDetails);

          const thumb = s?.thumbnail?.source
            ? Object.assign(document.createElement("img"), { className: "nearby-thumb", src: s.thumbnail.source, alt: "" })
            : Object.assign(document.createElement("div"), { className: "nearby-thumb" });

          const title = document.createElement("div");
          title.className = "nearby-title";
          title.textContent = p.title;

          const meta = document.createElement("div");
          meta.className = "nearby-meta";
          meta.textContent = `المسافة: ${fmtDist(p.dist)}`;

          const item = document.createElement("div");
          item.className = "nearby-item";
          item.appendChild(thumb);
          const right = document.createElement("div");
          right.append(title, meta);
          item.appendChild(right);
          item.addEventListener("click", openDetails);
          listEl.appendChild(item);
        });

        if (withDist.length === 0) {
          listEl.innerHTML = '<p class="muted">لا توجد صفحات قريبة في هذا النطاق.</p>';
        }
      } catch (e) {
        listEl.innerHTML = '<p class="muted">حدث خطأ أثناء جلب العناصر القريبة.</p>';
      }
    }, 400);

    map.on("moveend", loadNearby);
    window.addEventListener("hashchange", () => {
      const { z, lat, lon } = parseHash();
      map.setView([lat, lon], z);
    });

    loadNearby();
  }
});
