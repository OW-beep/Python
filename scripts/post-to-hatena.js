/**
 * Nexiary記事 → はてなブログ 自動投稿スクリプト
 *
 * はてなブログのAtomPub APIを使って、manifest.jsonに載っている記事を順番に投稿します。
 * 一度に全部投稿するのではなく、posted-log.json で「投稿済みslug」を記録し、
 * 実行するたびに「まだ投稿していない記事」から指定件数だけ投稿します。
 * → cron / GitHub Actionsで定期実行すれば、そのまま「自動投稿」になります。
 *
 * 必要な環境変数:
 *   HATENA_ID        はてなID（ログインID）
 *   HATENA_BLOG_ID   ブログID（例: example.hatenablog.com）
 *   HATENA_API_KEY   はてなブログの詳細設定 > AtomPub に表示されるAPIキー
 *
 * 任意の環境変数:
 *   POSTS_PER_RUN     1回の実行で投稿する件数（デフォルト: 1）
 *   DRAFT             "true"なら下書き投稿、"false"なら即公開（デフォルト: true＝下書き）
 *   DRY_RUN           "true"なら実際には送信せず、内容だけ確認する
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HATENA_ID = process.env.HATENA_ID;
const HATENA_BLOG_ID = process.env.HATENA_BLOG_ID;
const HATENA_API_KEY = process.env.HATENA_API_KEY;
const POSTS_PER_RUN = parseInt(process.env.POSTS_PER_RUN || "1", 10);
const DRAFT = (process.env.DRAFT ?? "true") !== "false";
const DRY_RUN = process.env.DRY_RUN === "true";

const ROOT = path.join(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "manifest.json");
const LOG_PATH = path.join(__dirname, "posted-log.json");

function loadJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// はてなAPIのWSSE認証ヘッダーを生成
function buildWsseHeader(username, apiKey) {
  const nonceRaw = crypto.randomBytes(16);
  const created = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const digest = crypto
    .createHash("sha1")
    .update(Buffer.concat([nonceRaw, Buffer.from(created), Buffer.from(apiKey)]))
    .digest("base64");
  const nonceB64 = nonceRaw.toString("base64");
  return `UsernameToken Username="${username}", PasswordDigest="${digest}", Nonce="${nonceB64}", Created="${created}"`;
}

function buildEntryXml(post, html) {
  const categories = (post.tags || [])
    .map((t) => `  <category term="${xmlEscape(t)}" />`)
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app">
  <title>${xmlEscape(post.title)}</title>
  <author><name>${xmlEscape(HATENA_ID)}</name></author>
  <content type="text/html">${xmlEscape(html)}</content>
${categories}
  <app:control>
    <app:draft>${DRAFT ? "yes" : "no"}</app:draft>
  </app:control>
</entry>`;
}

async function postEntry(post, html) {
  const endpoint = `https://blog.hatena.ne.jp/${HATENA_ID}/${HATENA_BLOG_ID}/atom/entry`;
  const wsse = buildWsseHeader(HATENA_ID, HATENA_API_KEY);
  const body = buildEntryXml(post, html);

  if (DRY_RUN) {
    console.log(`[DRY_RUN] Would POST ${endpoint}\n${body.slice(0, 300)}...`);
    return { ok: true, dryRun: true };
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/atom+xml;type=entry",
      "X-WSSE": wsse,
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return { ok: true, response: text };
}

async function main() {
  if (!DRY_RUN && (!HATENA_ID || !HATENA_BLOG_ID || !HATENA_API_KEY)) {
    console.error(
      "環境変数 HATENA_ID / HATENA_BLOG_ID / HATENA_API_KEY を設定してください（README参照）。"
    );
    process.exit(1);
  }

  const manifest = loadJson(MANIFEST_PATH, []);
  const log = loadJson(LOG_PATH, { posted: [] });
  const postedSet = new Set(log.posted.map((p) => p.slug));

  const pending = manifest.filter((p) => !postedSet.has(p.slug));
  if (pending.length === 0) {
    console.log("すべての記事を投稿済みです。");
    return;
  }

  const batch = pending.slice(0, POSTS_PER_RUN);
  console.log(`${pending.length}件が未投稿。今回は${batch.length}件を投稿します。`);

  for (const post of batch) {
    const htmlPath = path.join(ROOT, post.htmlFile);
    const html = fs.readFileSync(htmlPath, "utf-8");
    try {
      await postEntry(post, html);
      console.log(`✅ 投稿完了: ${post.title} (${post.slug})`);
      log.posted.push({ slug: post.slug, title: post.title, postedAt: new Date().toISOString() });
      saveJson(LOG_PATH, log);
    } catch (e) {
      console.error(`❌ 投稿失敗: ${post.slug}\n${e.message}`);
      process.exit(1);
    }
    // 連続投稿はAPI負荷・スパム判定を避けるため少し間隔を空ける
    await new Promise((r) => setTimeout(r, 2000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
