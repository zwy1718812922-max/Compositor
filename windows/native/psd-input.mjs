export async function readPsdBytes(opened, { request, fetchFile, decodeBase64 }) {
  // Older native hosts return base64 instead of a local file URL.
  if (typeof opened.data === 'string' && opened.data.length) return new Uint8Array(decodeBase64(opened.data));
  if (typeof opened.url !== 'string' || !/^https:\/\/compositor-import\.local\/_import\/[a-f0-9]{32}$/.test(opened.url)) {
    throw new Error('PSD 读取接口不兼容，请重新安装完整版本。');
  }
  const token = opened.url.slice(opened.url.lastIndexOf('/') + 1);
  try {
    const response = await fetchFile(opened.url);
    if (!response.ok) throw new Error('PSD 文件无法读取，请确认文件仍在原位置且可访问。');
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    // Cleanup must not replace the file-read error with a second error.
    await request('project:release', token).catch(() => {});
  }
}
