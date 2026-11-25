import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const androidAppDir = path.join(rootDir, "android-app");
const mainDir = path.join(androidAppDir, "app", "src", "main");
const resDir = path.join(mainDir, "res");
const drawableDir = path.join(resDir, "drawable");
const buildDir = path.join(androidAppDir, "build", "apk-build");
const releaseDir = path.join(androidAppDir, "build", "outputs", "apk", "release");

const sdkDir = process.env.ANDROID_HOME || "C:\\Users\\vinad\\AppData\\Local\\Android\\Sdk";
const buildToolsDir = path.join(sdkDir, "build-tools", "36.0.0");
const androidJar = path.join(sdkDir, "platforms", "android-36.1", "android.jar");
const jbrBinDir = "C:\\Program Files\\Android\\Android Studio\\jbr\\bin";

const aapt2 = path.join(buildToolsDir, "aapt2.exe");
const d8Bat = path.join(buildToolsDir, "d8.bat");
const zipalign = path.join(buildToolsDir, "zipalign.exe");
const apksignerBat = path.join(buildToolsDir, "apksigner.bat");
const javac = path.join(jbrBinDir, "javac.exe");
const jarExe = path.join(jbrBinDir, "jar.exe");
const keytool = path.join(jbrBinDir, "keytool.exe");

function ensureDirs() {
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(buildDir, "compiled_res"), { recursive: true });
  fs.mkdirSync(path.join(buildDir, "gen"), { recursive: true });
  fs.mkdirSync(path.join(buildDir, "obj"), { recursive: true });
  fs.mkdirSync(path.join(buildDir, "dex"), { recursive: true });
  fs.mkdirSync(path.join(buildDir, "unpacked"), { recursive: true });
  fs.mkdirSync(drawableDir, { recursive: true });
  fs.mkdirSync(releaseDir, { recursive: true });
}

function copyLauncherIcon() {
  const logoSrc = path.join(rootDir, "dashboard", "radar-logo-mark.png");
  const iconDest = path.join(drawableDir, "ic_launcher.png");
  fs.copyFileSync(logoSrc, iconDest);
  console.log("[APK] Launcher icon copied to", iconDest);
}

function listResourceFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listResourceFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function compileAndLinkResources() {
  const resFiles = listResourceFiles(resDir);
  const compiledDir = path.join(buildDir, "compiled_res");
  for (const file of resFiles) {
    execFileSync(aapt2, ["compile", file, "-o", compiledDir], { stdio: "inherit" });
  }

  const flatFiles = fs
    .readdirSync(compiledDir)
    .filter((f) => f.endsWith(".flat"))
    .map((f) => path.join(compiledDir, f));

  const unsignedApk = path.join(buildDir, "unsigned-unaligned.apk");
  execFileSync(
    aapt2,
    [
      "link",
      "-o",
      unsignedApk,
      "-I",
      androidJar,
      "--manifest",
      path.join(mainDir, "AndroidManifest.xml"),
      "--java",
      path.join(buildDir, "gen"),
      "--min-sdk-version",
      "24",
      "--target-sdk-version",
      "35",
      "--version-code",
      "300",
      "--version-name",
      "3.0.0",
      ...flatFiles
    ],
    { stdio: "inherit" }
  );
  console.log("[APK] Resources compiled and linked with aapt2.");
  return unsignedApk;
}

function compileJavaAndDex() {
  const mainJava = path.join(
    mainDir,
    "java",
    "br",
    "com",
    "radardetalentos",
    "app",
    "MainActivity.java"
  );
  const rJava = path.join(
    buildDir,
    "gen",
    "br",
    "com",
    "radardetalentos",
    "app",
    "R.java"
  );

  execFileSync(
    javac,
    [
      "--release",
      "11",
      "-encoding",
      "UTF-8",
      "-cp",
      androidJar,
      "-d",
      path.join(buildDir, "obj"),
      mainJava,
      rJava
    ],
    { stdio: "inherit" }
  );

  const classDir = path.join(buildDir, "obj", "br", "com", "radardetalentos", "app");
  const classFiles = fs
    .readdirSync(classDir)
    .filter((f) => f.endsWith(".class"))
    .map((f) => path.join(classDir, f));

  const env = {
    ...process.env,
    JAVA_HOME: "C:\\Program Files\\Android\\Android Studio\\jbr",
    PATH: `${jbrBinDir};${process.env.PATH || ""}`
  };

  execFileSync(
    "cmd.exe",
    [
      "/c",
      d8Bat,
      "--min-api",
      "24",
      "--lib",
      androidJar,
      "--output",
      path.join(buildDir, "dex"),
      ...classFiles
    ],
    { stdio: "inherit", env }
  );
  console.log("[APK] Java sources compiled and converted to classes.dex.");
}

function packageAlignAndSign(unsignedApk) {
  const classesDex = path.join(buildDir, "dex", "classes.dex");
  const buildCopyDex = path.join(buildDir, "classes.dex");
  fs.copyFileSync(classesDex, buildCopyDex);

  execFileSync(jarExe, ["-uf", unsignedApk, "-C", buildDir, "classes.dex"], {
    stdio: "inherit"
  });

  const alignedApk = path.join(buildDir, "aligned.apk");
  execFileSync(zipalign, ["-f", "-p", "4", unsignedApk, alignedApk], {
    stdio: "inherit"
  });

  const keystorePath = path.join(androidAppDir, "radar-release-key.jks");
  const keystorePass = "radartalentos2026";
  const keyAlias = "radar-key";

  if (!fs.existsSync(keystorePath)) {
    execFileSync(
      keytool,
      [
        "-genkeypair",
        "-v",
        "-keystore",
        keystorePath,
        "-alias",
        keyAlias,
        "-keyalg",
        "RSA",
        "-keysize",
        "2048",
        "-validity",
        "10000",
        "-storepass",
        keystorePass,
        "-keypass",
        keystorePass,
        "-dname",
        "CN=Radar de Talentos, OU=Inteligencia Estrategica, O=Radar de Talentos, L=Sao Paulo, ST=SP, C=BR"
      ],
      { stdio: "inherit" }
    );
  }

  const finalReleaseApk = path.join(releaseDir, "radar-de-talentos.apk");
  const dashboardApk = path.join(rootDir, "dashboard", "radar-de-talentos.apk");

  const env = {
    ...process.env,
    JAVA_HOME: "C:\\Program Files\\Android\\Android Studio\\jbr",
    PATH: `${jbrBinDir};${process.env.PATH || ""}`
  };

  execFileSync(
    "cmd.exe",
    [
      "/c",
      apksignerBat,
      "sign",
      "--ks",
      keystorePath,
      "--ks-key-alias",
      keyAlias,
      "--ks-pass",
      `pass:${keystorePass}`,
      "--key-pass",
      `pass:${keystorePass}`,
      "--out",
      finalReleaseApk,
      alignedApk
    ],
    { stdio: "inherit", env }
  );

  execFileSync(
    "cmd.exe",
    ["/c", apksignerBat, "verify", "--verbose", finalReleaseApk],
    { stdio: "inherit", env }
  );

  fs.copyFileSync(finalReleaseApk, dashboardApk);
  const sizeKb = (fs.statSync(dashboardApk).size / 1024).toFixed(1);
  console.log(`[APK] Signed APK ready: ${dashboardApk} (${sizeKb} KB)`);
}

ensureDirs();
copyLauncherIcon();
const unsignedApk = compileAndLinkResources();
compileJavaAndDex();
packageAlignAndSign(unsignedApk);
