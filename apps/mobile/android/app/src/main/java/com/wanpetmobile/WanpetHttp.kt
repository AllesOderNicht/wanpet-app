package com.wanpetmobile

import java.net.URI
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

internal class WanpetHttp(private val development: Boolean, timeoutMillis: Long = 12000) {
  private val client = OkHttpClient.Builder()
    .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
    .callTimeout(timeoutMillis, TimeUnit.MILLISECONDS)
    .connectTimeout(timeoutMillis, TimeUnit.MILLISECONDS)
    .readTimeout(timeoutMillis, TimeUnit.MILLISECONDS)
    .writeTimeout(timeoutMillis, TimeUnit.MILLISECONDS)
    .build()

  // Reads can recover stale pooled sockets; writes are retried explicitly by Session.
  private val readClient = client.newBuilder().retryOnConnectionFailure(true).build()

  data class Result(val status: Int, val body: String)

  fun request(url: String, method: String, headers: Map<String, String>, body: String?): Result {
    val uri = URI(url)
    val allowed = uri.scheme == "https" || (development && uri.scheme == "http" && uri.host in listOf("127.0.0.1", "localhost") && uri.port > 0)
    require(allowed && uri.userInfo == null && uri.fragment == null && uri.host != null)
    val request = Request.Builder().url(url).method(method, body?.toRequestBody())
    headers.forEach { (name, value) -> request.header(name, value) }
    (if (method == "GET" || method == "HEAD") readClient else client).newCall(request.build()).execute().use { response ->
      val responseBody = response.body
      val limit = 2 * 1024 * 1024
      require((responseBody?.contentLength() ?: 0) <= limit)
      val output = java.io.ByteArrayOutputStream()
      responseBody?.byteStream()?.use { input ->
        val buffer = ByteArray(8192)
        while (true) {
          val size = input.read(buffer)
          if (size < 0) break
          require(output.size() + size <= limit)
          output.write(buffer, 0, size)
        }
      }
      return Result(response.code, output.toString(Charsets.UTF_8.name()))
    }
  }

  fun close() { client.dispatcher.cancelAll(); client.connectionPool.evictAll() }
}
