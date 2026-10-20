// Поднимает patch-номер перед каждой сборкой (npm run build).
// Один и тот же номер пишется в package.json, Cargo.toml, Cargo.lock,
// tauri.conf.json и в ?v= кэша index.html (BUILD_VERSION читает его из тега script).
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
	return fs.readFileSync(path.join(root, rel), "utf8");
}
function write(rel, text) {
	fs.writeFileSync(path.join(root, rel), text);
}

const pkg = read("package.json");
const match = pkg.match(/"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"/);
if (!match) {
	console.error("package.json: version not found");
	process.exit(1);
}
const prev = `${match[1]}.${match[2]}.${match[3]}`;
const next = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
const nextBuild = String(Number(match[3]) + 1);

function mustReplace(rel, from, to) {
	const text = read(rel);
	if (!text.includes(from)) {
		console.error(rel + ": missing " + from);
		process.exit(1);
	}
	write(rel, text.split(from).join(to));
}

mustReplace("package.json", `"version": "${prev}"`, `"version": "${next}"`);
mustReplace("src-tauri/Cargo.toml", `version = "${prev}"`, `version = "${next}"`);
mustReplace("src-tauri/tauri.conf.json", `"version": "${prev}"`, `"version": "${next}"`);
mustReplace("Borg.Box/index.html", `?v=${match[3]}`, `?v=${nextBuild}`);

const lockRel = "src-tauri/Cargo.lock";
const lock = read(lockRel);
const lockNext = lock.replace(
	/(name = "app"\r?\nversion = ")(\d+\.\d+\.\d+)(")/,
	`$1${next}$3`
);
if (lockNext === lock) {
	console.error("Cargo.lock: app package version not found");
	process.exit(1);
}
write(lockRel, lockNext);

console.log("Bumped Borg.Box " + prev + " -> " + next);
