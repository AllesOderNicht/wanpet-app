package com.wanpetmobile

import android.util.AtomicFile
import com.facebook.react.bridge.*
import com.facebook.react.ReactPackage
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.KeyStore
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import java.util.concurrent.Executors

class WanpetPlatform(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newFixedThreadPool(2)
  private val diskLock = Any()
  private val http = WanpetHttp(BuildConfig.DEBUG)
  private val recorder = WanpetRecorder(context)
  override fun getName() = "WanpetPlatform"
  override fun getConstants(): Map<String, Any> = mapOf("apiBaseURL" to BuildConfig.WANPET_API_BASE_URL.ifEmpty { if(BuildConfig.DEBUG) "http://127.0.0.1:3100/v1" else "" }, "resourcePath" to context.filesDir.absolutePath)
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun nowMilliseconds(): Double = android.os.SystemClock.elapsedRealtime().toDouble()
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun newKey(): String { val bytes=ByteArray(24); SecureRandom().nextBytes(bytes); return bytes.joinToString("") { "%02x".format(it.toInt() and 255) } }
  @ReactMethod
  fun request(url: String, method: String, headers: ReadableMap, body: String?, promise: Promise) {
    executor.execute {
      try {
        val values = mutableMapOf<String, String>()
        val iterator = headers.keySetIterator()
        while(iterator.hasNextKey()) { val key=iterator.nextKey(); headers.getString(key)?.let { values[key]=it } }
        val response=http.request(url,method,values,body)
        val result=Arguments.createMap();result.putInt("status",response.status);result.putString("body",response.body);promise.resolve(result)
      } catch(error:Exception){
        if(BuildConfig.DEBUG) android.util.Log.w("WanpetHttp", "Request failed (${error.javaClass.simpleName})")
        promise.reject("NETWORK","Request failed")
      }
    }
  }
  private fun file(key:String):AtomicFile {
    val root=File(context.noBackupFilesDir,"wanpet-journal");check(root.isDirectory || root.mkdirs())
    val hash=MessageDigest.getInstance("SHA-256").digest(key.toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it.toInt() and 255)}
    return AtomicFile(File(root,"$hash.json"))
  }
  @ReactMethod
  fun read(key:String,promise:Promise){executor.execute{synchronized(diskLock){try{val f=file(key);promise.resolve(if(f.baseFile.exists())f.openRead().use{it.readBytes().toString(Charsets.UTF_8)}else null)}catch(error:Exception){promise.reject("STORAGE","Cannot read journal")}}}}
  @ReactMethod
  fun write(key:String,value:String,promise:Promise){executor.execute{synchronized(diskLock){try{
    val f=file(key);val output=f.startWrite()
    try{output.write(value.toByteArray(Charsets.UTF_8));f.finishWrite(output);promise.resolve(null)}catch(error:Exception){f.failWrite(output);throw error}
  }catch(error:Exception){promise.reject("STORAGE","Cannot save journal")}}}}
  @ReactMethod
  fun remove(key:String,promise:Promise){executor.execute{synchronized(diskLock){try{val f=file(key);f.delete();check(!f.baseFile.exists());promise.resolve(null)}catch(error:Exception){promise.reject("STORAGE","Cannot remove journal")}}}}
  private fun credentialFile(key:String):AtomicFile {
    val root=File(context.noBackupFilesDir,"wanpet-credentials");check(root.isDirectory||root.mkdirs())
    val hash=MessageDigest.getInstance("SHA-256").digest(key.toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it.toInt() and 255)}
    return AtomicFile(File(root,"$hash.bin"))
  }
  private fun credentialKey():SecretKey {
    val alias=context.packageName+".sessions"
    val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
    (store.getKey(alias,null) as? SecretKey)?.let{return it}
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{
      init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  @ReactMethod
  fun readCredential(key:String,promise:Promise){executor.execute{synchronized(diskLock){try{
    val f=credentialFile(key)
    if(!f.baseFile.exists()){promise.resolve(null);return@synchronized}
    val bytes=f.openRead().use{it.readBytes()};check(bytes.size in 29..16384)
    val cipher=Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE,credentialKey(),GCMParameterSpec(128,bytes.copyOfRange(0,12)))
    cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
    promise.resolve(cipher.doFinal(bytes.copyOfRange(12,bytes.size)).toString(Charsets.UTF_8))
  }catch(error:Exception){promise.reject("CREDENTIAL_STORAGE","Cannot read saved login")}}}}
  @ReactMethod
  fun writeCredential(key:String,value:String,promise:Promise){executor.execute{synchronized(diskLock){try{
    check(value.toByteArray(Charsets.UTF_8).size<=16000)
    val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,credentialKey());check(cipher.iv.size==12)
    cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
    val bytes=cipher.iv+cipher.doFinal(value.toByteArray(Charsets.UTF_8));val f=credentialFile(key);val output=f.startWrite()
    try{output.write(bytes);f.finishWrite(output);promise.resolve(null)}catch(error:Exception){f.failWrite(output);throw error}
  }catch(error:Exception){promise.reject("CREDENTIAL_STORAGE","Cannot save login")}}}}
  @ReactMethod
  fun removeCredential(key:String,promise:Promise){executor.execute{synchronized(diskLock){try{
    val f=credentialFile(key);f.delete();check(!f.baseFile.exists());promise.resolve(null)
  }catch(error:Exception){promise.reject("CREDENTIAL_STORAGE","Cannot remove saved login")}}}}
  @ReactMethod
  fun startRecording(promise:Promise){executor.execute{try{recorder.start();promise.resolve(null)}catch(e:SecurityException){promise.reject("MICROPHONE_DENIED","Microphone permission required")}catch(e:Exception){promise.reject("RECORDING_FAILED","Cannot start recording")}}}
  @ReactMethod
  fun stopRecording(promise:Promise){executor.execute{try{val audio=recorder.stop()!!;val result=Arguments.createMap();result.putString("audio",android.util.Base64.encodeToString(audio,android.util.Base64.NO_WRAP));audio.fill(0);promise.resolve(result)}catch(e:Exception){promise.reject("RECORDING_FAILED","Cannot read recording")}}}
  @ReactMethod
  fun cancelRecording(promise:Promise){executor.execute{try{recorder.stop(true);promise.resolve(null)}catch(e:Exception){promise.reject("RECORDING_FAILED","Cannot cancel recording")}}}
  override fun invalidate(){recorder.stop(true);http.close();executor.shutdownNow();super.invalidate()}
}
class WanpetPlatformPackage:ReactPackage{
 override fun createNativeModules(context:ReactApplicationContext):List<NativeModule> = listOf(WanpetPlatform(context))
 override fun createViewManagers(context:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()
}
