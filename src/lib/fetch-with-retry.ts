/** 带连接超时和自动重试的 fetch 封装（仅重试网络错误，不重试 4xx/5xx） */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  connectionTimeout = 30000,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), connectionTimeout);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
  throw new Error("Request failed after retries");
}
