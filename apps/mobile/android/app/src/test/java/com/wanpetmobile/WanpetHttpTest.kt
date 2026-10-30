package com.wanpetmobile

import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import okio.Buffer
import org.junit.Assert.*
import org.junit.Test

class WanpetHttpTest {
  private fun server(response: MockResponse, check: (MockWebServer, String) -> Unit) {
    val server = MockWebServer()
    server.enqueue(response)
    server.start()
    try { check(server, server.url("/").toString()) }
    finally { server.shutdown() }
  }

  @Test fun preservesUtf8AndRequestHeaders() {
    val body="{\"message\":\"小猫回家了 🐈\"}"
    server(MockResponse().setBody(body)) { server, base ->
      val http=WanpetHttp(true)
      try {
        val result=http.request(base,"POST",mapOf("Authorization" to "Bearer test-only"),"猫")
        assertEquals(200,result.status);assertEquals(body,result.body)
        val request=server.takeRequest(1,TimeUnit.SECONDS)!!
        assertEquals("猫",request.body.readUtf8())
        assertEquals("Bearer test-only",request.getHeader("Authorization"))
      } finally { http.close() }
    }
  }

  @Test fun doesNotFollowRedirects() {
    server(MockResponse().setResponseCode(302).addHeader("Location","/target")) { server, base ->
      server.enqueue(MockResponse().setBody("must not follow"))
      val http=WanpetHttp(true)
      try { assertEquals(302,http.request(base,"GET",emptyMap(),null).status);assertEquals(1,server.requestCount) }
      finally { http.close() }
    }
  }

  @Test fun boundsChunkedResponsesWithoutContentLength() {
    val response=MockResponse().setChunkedBody(Buffer().write(ByteArray(2*1024*1024+1)),8192)
    server(response) { _, base ->
      val http=WanpetHttp(true)
      try { assertThrows(IllegalArgumentException::class.java) { http.request(base,"GET",emptyMap(),null) } }
      finally { http.close() }
    }
  }

  @Test fun totalDeadlineStopsAContinuouslyDrippingResponse() {
    val response=MockResponse().setBody(" ".repeat(100)).throttleBody(1,20,TimeUnit.MILLISECONDS)
    server(response) { _, base ->
      val http=WanpetHttp(true,250)
      val started=System.nanoTime()
      try {
        assertThrows(IOException::class.java) { http.request(base,"GET",emptyMap(),null) }
        assertTrue("total timeout must bound slow streaming",(System.nanoTime()-started)/1_000_000<1500)
      } finally { http.close() }
    }
  }

  @Test fun recoversReadFromLatePooledConnectionFailure() {
    server(MockResponse().setBody("first")) { server, base ->
      server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
      server.enqueue(MockResponse().setBody("recovered"))
      val http=WanpetHttp(true)
      try {
        assertEquals("first",http.request(base,"GET",emptyMap(),null).body)
        assertEquals("recovered",http.request(base,"GET",emptyMap(),null).body)
        assertEquals(3,server.requestCount)
      } finally { http.close() }
    }
  }

  @Test fun doesNotAutomaticallyReplayWritesAfterConnectionFailure() {
    server(MockResponse().setBody("first")) { server, base ->
      server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
      server.enqueue(MockResponse().setBody("must not replay"))
      val http=WanpetHttp(true)
      try {
        http.request(base,"GET",emptyMap(),null)
        assertThrows(IOException::class.java) { http.request(base,"POST",emptyMap(),"{}") }
        assertEquals(2,server.requestCount)
      } finally { http.close() }
    }
  }

  @Test fun releaseRejectsCleartextBeforeSending() {
    val http=WanpetHttp(false)
    try { assertThrows(IllegalArgumentException::class.java) { http.request("http://127.0.0.1:3100/v1","GET",emptyMap(),null) } }
    finally { http.close() }
  }
}
