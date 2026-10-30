package com.wanpetmobile

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Bounded in-memory PCM recording; no microphone bytes are written to disk. */
internal class WanpetRecorder(private val context: Context) {
  @Volatile private var recording = false
  private var recorder: AudioRecord? = null
  private var thread: Thread? = null
  private val pcm = ByteArray(16000 * 2 * 60)
  private var used = 0
  @Volatile private var failed = false

  @SuppressLint("MissingPermission")
  @Synchronized fun start() {
    if(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) throw SecurityException("MICROPHONE_DENIED")
    check(thread == null) { "RECORDING_BUSY" }
    val size = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    check(size > 0)
    val input = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,maxOf(size,4096))
    if(input.state != AudioRecord.STATE_INITIALIZED){ input.release(); error("RECORDING_FAILED") }
    used=0;failed=false;recording=true;recorder=input
    try { input.startRecording() } catch(e:Exception){recording=false;recorder=null;input.release();throw e}
    thread=Thread({
      try {
        while(recording && used < pcm.size) {
          val count=input.read(pcm,used,minOf(2048,pcm.size-used))
          if(count<0){if(recording)failed=true;break}
          if(count>0)used+=count
        }
      } catch(e:Exception){if(recording)failed=true}
      finally {recording=false}
    },"WanpetRecording").also{it.start()}
  }
  @Synchronized fun stop(discard:Boolean=false):ByteArray? {
    recording=false
    val input=recorder
    try {input?.stop()}catch(_:Exception){}
    thread?.join(2000)
    val stuck=thread?.isAlive==true
    input?.release();recorder=null;thread=null
    try {
      if(discard)return null
      check(!stuck && !failed && used>=3200) { "RECORDING_FAILED" }
      val count=used-used%2
      return ByteBuffer.allocate(44+count).order(ByteOrder.LITTLE_ENDIAN).apply {
        put("RIFF".toByteArray());putInt(36+count);put("WAVEfmt ".toByteArray());putInt(16)
        putShort(1);putShort(1);putInt(16000);putInt(32000);putShort(2);putShort(16)
        put("data".toByteArray());putInt(count);put(pcm,0,count)
      }.array()
    } finally {pcm.fill(0);used=0}
  }
}
