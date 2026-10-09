import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = path.resolve("out");
const localBase = "/weng/app/taxes/out";
const remoteBase = "/app/taxes/out";
const baseExpr = `(location.hostname==="localhost"||location.hostname==="127.0.0.1"?"${localBase}":"${remoteBase}")`;
const runtimeMarker = "window.__TAX_BASE__";
const turbopackNeedle = 'let t="/_next/"';

const assetTag =
  /<link\b[^>]*>|<script\b[^>]*\bsrc="\/(?:_next\/|favicon\.ico)[^"]*"[^>]*>\s*<\/script>/g;

function isAssetTag(tag) {
  return tag.includes('="/_next/') || tag.includes('="/favicon.ico');
}

function jsString(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function bootstrap(tags) {
  const encoded = tags.map((tag) => jsString(tag)).join(",");
  return `<script>(function(){var b=${baseExpr};window.__TAX_BASE__=b;var tags=[${encoded}];for(var i=0;i<tags.length;i++){document.write(tags[i].replace(/="\\/_next\\//g,'="'+b+'/_next/').replace(/="\\/favicon\\.ico/g,'="'+b+'/favicon.ico'));}function prefixNext(value){if(typeof value==="string"){return value.replace(/(^|["'=])\\/_next\\//g,function(match,lead){return lead+b+"/_next/";});}if(Array.isArray(value))return value.map(prefixNext);return value;}var queue=self.__next_f||(self.__next_f=[]);for(var j=0;j<queue.length;j++)queue[j]=prefixNext(queue[j]);var nativePush=Array.prototype.push;var currentPush=function(){var args=[];for(var k=0;k<arguments.length;k++)args.push(prefixNext(arguments[k]));return nativePush.apply(queue,args);};Object.defineProperty(queue,"push",{configurable:true,enumerable:true,get:function(){return currentPush;},set:function(next){currentPush=function(){var args=[];for(var k=0;k<arguments.length;k++)args.push(prefixNext(arguments[k]));return next.apply(this,args);};}});var origFetch=window.fetch;if(typeof origFetch==="function"){window.fetch=function(input,init){return origFetch.call(window,input,init).then(function(res){var pathname="";try{pathname=new URL(res.url,location.href).pathname;}catch(e){return res;}if(!pathname.endsWith(".txt"))return res;return res.text().then(function(body){var headers=new Headers(res.headers);headers.delete("content-length");return new Response(prefixNext(body),{status:res.status,statusText:res.statusText,headers:headers});});});};}})();</script>`;
}

function rewriteHtml(html) {
  if (html.includes(runtimeMarker)) return html;
  const tags = [];
  const stripped = html.replace(assetTag, (tag) => {
    if (!isAssetTag(tag)) return tag;
    tags.push(tag);
    return "";
  });
  if (tags.length === 0) return html;
  const script = bootstrap(tags);
  const viewport = stripped.indexOf('<meta name="viewport"');
  if (viewport === -1) {
    return stripped.replace("<head>", `<head>${script}`);
  }
  const close = stripped.indexOf(">", viewport);
  return stripped.slice(0, close + 1) + script + stripped.slice(close + 1);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

const files = await walk(outDir);
let htmlCount = 0;
let runtimeCount = 0;

for (const file of files) {
  if (file.endsWith(".html")) {
    const html = await readFile(file, "utf8");
    const next = rewriteHtml(html);
    if (next !== html) {
      await writeFile(file, next);
      htmlCount += 1;
    }
  } else if (file.endsWith(".js")) {
    const source = await readFile(file, "utf8");
    if (!source.includes(turbopackNeedle)) continue;
    const next = source.replaceAll(
      turbopackNeedle,
      `let t=${baseExpr}+"/_next/"`,
    );
    await writeFile(file, next);
    runtimeCount += 1;
  }
}

if (htmlCount === 0 || runtimeCount === 0) {
  throw new Error(
    `Export basename rewrite did not find the expected files (html ${htmlCount}, turbopack runtime ${runtimeCount}).`,
  );
}

console.log(
  `Prefixed ${htmlCount} HTML files and ${runtimeCount} chunk runtimes for ${localBase} on localhost and ${remoteBase} otherwise.`,
);
