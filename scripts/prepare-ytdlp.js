const fs = require('fs');
const https = require('https');
const path = require('path');
const { execFileSync } = require('child_process');

const TARGET_PATH = path.join(__dirname, '..', 'vendor', 'yt-dlp', 'yt-dlp.exe');
const DOWNLOAD_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function isExecutable(binaryPath) {
  try {
    execFileSync(binaryPath, ['--version'], { stdio: 'ignore', timeout: 5000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function downloadFile(url, destinationPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects while downloading yt-dlp'));
      return;
    }

    const tempPath = `${destinationPath}.download`;
    try { fs.rmSync(tempPath, { force: true }); } catch {}

    const request = https.get(url, {
      headers: {
        'user-agent': 'Localfy-build',
      },
    }, (response) => {
      if (REDIRECT_CODES.has(response.statusCode) && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, url).toString();
        downloadFile(nextUrl, destinationPath, redirectCount + 1).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Failed to download yt-dlp (${response.statusCode || 'unknown status'})`));
        return;
      }

      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      const file = fs.createWriteStream(tempPath);
      response.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          try {
            fs.renameSync(tempPath, destinationPath);
            resolve(destinationPath);
          } catch (error) {
            reject(error);
          }
        });
      });

      file.on('error', (error) => {
        try { file.close(() => {}); } catch {}
        try { fs.rmSync(tempPath, { force: true }); } catch {}
        reject(error);
      });
    });

    request.on('error', (error) => {
      try { fs.rmSync(tempPath, { force: true }); } catch {}
      reject(error);
    });

    request.setTimeout(30000, () => {
      request.destroy(new Error('Timed out while downloading yt-dlp'));
    });
  });
}

async function main() {
  const forceRefresh = process.env.LOCALFY_REFRESH_YTDLP === '1';
  if (!forceRefresh && fs.existsSync(TARGET_PATH) && isExecutable(TARGET_PATH)) {
    process.stdout.write(`[prepare-ytdlp] Using cached binary at ${TARGET_PATH}\n`);
    return;
  }

  process.stdout.write(`[prepare-ytdlp] Downloading yt-dlp to ${TARGET_PATH}\n`);
  await downloadFile(DOWNLOAD_URL, TARGET_PATH);

  if (!isExecutable(TARGET_PATH)) {
    throw new Error('Downloaded yt-dlp binary could not be executed');
  }

  process.stdout.write('[prepare-ytdlp] yt-dlp is ready\n');
}

main().catch((error) => {
  console.error(`[prepare-ytdlp] ${error.message}`);
  process.exit(1);
});
