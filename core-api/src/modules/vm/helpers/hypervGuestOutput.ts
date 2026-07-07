/**
 * Decode and parse QEMU guest-agent exec output (Windows Hyper-V checks).
 */

export const HYPERV_STATE_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$s=(Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V | Select-Object -ExpandProperty State).ToString().Trim()",
  "if($s -eq 'Enabled'){'HYPERV_STATE=ON'}else{'HYPERV_STATE=OFF'}",
].join('; ');

export function looksLikeFeatureState(text: string): boolean {
  return /hyperv_state=(on|off)|\benabled\b|\bdisabled\b/i.test(text);
}

function bufferHexPreview(buf: Buffer, max = 32): string {
  return buf.subarray(0, max).toString('hex');
}

export type DecodeLogFn = (payload: Record<string, unknown>) => void;

/**
 * Decode stdout/stderr from QEMU guest-exec `out-data` / `err-data`.
 * Plain text like "Enabled" must not be base64-decoded (valid base64 alphabet, wrong result).
 */
export function decodeAgentOutput(
  data?: string,
  log?: DecodeLogFn
): string {
  if (!data) return '';
  const trimmed = data.trim();
  if (!trimmed) return '';

  const candidates: { name: string; text: string }[] = [{ name: 'plain', text: trimmed }];

  const tryBase64 =
    !looksLikeFeatureState(trimmed) &&
    /^[A-Za-z0-9+/]+=*$/.test(trimmed) &&
    trimmed.length >= 8 &&
    trimmed.length % 4 === 0;

  let decodedBuf: Buffer | undefined;
  if (tryBase64) {
    try {
      decodedBuf = Buffer.from(trimmed, 'base64');
      if (decodedBuf.length > 0) {
        if (decodedBuf.length >= 2 && decodedBuf[0] === 0xff && decodedBuf[1] === 0xfe) {
          candidates.push({
            name: 'b64-utf16le-bom',
            text: decodedBuf.subarray(2).toString('utf16le').replace(/\0/g, '').trim(),
          });
        }
        candidates.push(
          { name: 'b64-utf16le', text: decodedBuf.toString('utf16le').replace(/\0/g, '').trim() },
          { name: 'b64-utf8', text: decodedBuf.toString('utf8').trim() },
          { name: 'b64-latin1', text: decodedBuf.toString('latin1').trim() }
        );
      }
    } catch {
      // ignore
    }
  }

  if (log) {
    log({
      rawLen: trimmed.length,
      rawPreview: trimmed.slice(0, 120),
      tryBase64,
      decodedLen: decodedBuf?.length,
      decodedHex: decodedBuf ? bufferHexPreview(decodedBuf) : undefined,
      candidates: candidates.map((c) => ({ name: c.name, text: c.text.slice(0, 120) })),
    });
  }

  for (const c of candidates) {
    if (looksLikeFeatureState(c.text)) return c.text;
  }

  if (/^[\x20-\x7e\r\n\t]+$/.test(trimmed)) return trimmed;

  const utf16 = candidates.find((c) => c.name.startsWith('b64-utf16'));
  return utf16?.text ?? candidates[candidates.length - 1]?.text ?? trimmed;
}

export function parseHyperVState(stdout: string): 'Enabled' | 'Disabled' | 'unknown' {
  const text = stdout.replace(/\0/g, '').trim().toLowerCase();
  if (text.includes('hyperv_state=on') || /\benabled\b/.test(text)) return 'Enabled';
  if (text.includes('hyperv_state=off') || /\bdisabled\b/.test(text)) return 'Disabled';
  return 'unknown';
}

export function isProcessExited(data: { exited?: number | boolean }): boolean {
  return data.exited === 1 || data.exited === true;
}
