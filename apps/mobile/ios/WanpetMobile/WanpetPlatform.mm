#import <React/RCTBridgeModule.h>
#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <CommonCrypto/CommonDigest.h>
#import <AVFoundation/AVFoundation.h>

@interface WPRequest : NSObject <NSURLSessionDataDelegate>
@property(nonatomic,strong) NSURLSession *session;
@property(nonatomic,strong) NSMutableData *data;
@property(nonatomic,strong) NSHTTPURLResponse *response;
@property(nonatomic,copy) RCTPromiseResolveBlock resolve;
@property(nonatomic,copy) RCTPromiseRejectBlock reject;
@end
@implementation WPRequest
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request completionHandler:(void (^)(NSURLRequest *))completionHandler { completionHandler(nil); }
- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)task didReceiveResponse:(NSURLResponse *)response completionHandler:(void (^)(NSURLSessionResponseDisposition))completionHandler {
  self.response = (NSHTTPURLResponse *)response;
  completionHandler(response.expectedContentLength > 2 * 1024 * 1024 ? NSURLSessionResponseCancel : NSURLSessionResponseAllow);
}
- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)task didReceiveData:(NSData *)data {
  if (self.data.length + data.length > 2 * 1024 * 1024) { [task cancel]; return; }
  [self.data appendData:data];
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
  NSString *body = [[NSString alloc] initWithData:self.data encoding:NSUTF8StringEncoding];
  if (error || !body) self.reject(@"NETWORK", @"Request failed", nil);
  else self.resolve(@{@"status":@(self.response.statusCode), @"body":body});
  [session finishTasksAndInvalidate]; self.session = nil;
}
@end

@interface WanpetPlatform : NSObject <RCTBridgeModule>
@property(nonatomic,strong) AVAudioRecorder *recorder;
@property(nonatomic,strong) NSURL *recordingFile;
@property(nonatomic,assign) NSInteger recordingGeneration;
@property(nonatomic,copy) NSString *audioCategory;
@property(nonatomic,copy) NSString *audioMode;
@property(nonatomic,assign) AVAudioSessionCategoryOptions audioOptions;
@end
@implementation WanpetPlatform
RCT_EXPORT_MODULE();
- (instancetype)init {
  self=[super init];
  if(self){self.recordingFile=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:@"wanpet-recording.wav"]];[[NSFileManager defaultManager] removeItemAtURL:self.recordingFile error:nil];}
  return self;
}
- (void)clearRecording {
  self.recordingGeneration++;[self.recorder stop];self.recorder=nil;
  [[NSFileManager defaultManager] removeItemAtURL:self.recordingFile error:nil];
  if(self.audioCategory){[[AVAudioSession sharedInstance] setCategory:self.audioCategory mode:self.audioMode options:self.audioOptions error:nil];self.audioCategory=nil;}
}
RCT_REMAP_METHOD(startRecording, startRecordingResolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    if(self.recorder){reject(@"RECORDING_BUSY",@"Recording already started",nil);return;}
    NSInteger generation=++self.recordingGeneration;
    [[AVAudioSession sharedInstance] requestRecordPermission:^(BOOL granted){dispatch_async(dispatch_get_main_queue(), ^{
      if(generation!=self.recordingGeneration){reject(@"RECORDING_CANCELLED",@"Recording cancelled",nil);return;}
      if(!granted){reject(@"MICROPHONE_DENIED",@"Microphone permission required",nil);return;}
      AVAudioSession *audio=[AVAudioSession sharedInstance];self.audioCategory=audio.category;self.audioMode=audio.mode;self.audioOptions=audio.categoryOptions;
      NSError *error=nil;
      [audio setCategory:AVAudioSessionCategoryPlayAndRecord mode:AVAudioSessionModeDefault options:AVAudioSessionCategoryOptionMixWithOthers|AVAudioSessionCategoryOptionDefaultToSpeaker error:&error];
      if(!error)[audio setActive:YES error:&error];
      NSDictionary *settings=@{AVFormatIDKey:@(kAudioFormatLinearPCM),AVSampleRateKey:@16000,AVNumberOfChannelsKey:@1,AVLinearPCMBitDepthKey:@16,AVLinearPCMIsFloatKey:@NO,AVLinearPCMIsBigEndianKey:@NO};
      if(!error)self.recorder=[[AVAudioRecorder alloc] initWithURL:self.recordingFile settings:settings error:&error];
      if(error||![self.recorder recordForDuration:60]){[self clearRecording];reject(@"RECORDING_FAILED",@"Cannot start recording",nil);return;}
      [[NSFileManager defaultManager] setAttributes:@{NSFileProtectionKey:NSFileProtectionComplete} ofItemAtPath:self.recordingFile.path error:nil];resolve(nil);
    });}];
  });
}
RCT_REMAP_METHOD(stopRecording, stopRecordingResolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [self.recorder stop];NSData *data=[NSData dataWithContentsOfURL:self.recordingFile];
    NSString *encoded=data.length>=44&&data.length<=1940000?[data base64EncodedStringWithOptions:0]:nil;
    [self clearRecording];if(encoded)resolve(@{@"audio":encoded});else reject(@"RECORDING_FAILED",@"Cannot read recording",nil);
  });
}
RCT_REMAP_METHOD(cancelRecording, cancelRecordingResolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{[self clearRecording];resolve(nil);});
}
+ (BOOL)requiresMainQueueSetup { return NO; }
- (NSDictionary *)constantsToExport {
  NSString *base = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"WanpetAPIBaseURL"];
#if DEBUG
  if (!base.length) base = @"http://127.0.0.1:3100/v1";
#endif
  return @{@"apiBaseURL":base ?: @"", @"resourcePath":[NSBundle mainBundle].resourcePath ?: @""};
}
RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(nowMilliseconds) { return @([NSProcessInfo processInfo].systemUptime * 1000.0); }
RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(newKey) {
  unsigned char bytes[24];
  if (SecRandomCopyBytes(kSecRandomDefault, sizeof(bytes), bytes) != errSecSuccess) return nil;
  NSMutableString *key = [NSMutableString new];
  for (int i=0;i<24;i++) [key appendFormat:@"%02x",bytes[i]];
  return key;
}
- (NSMutableDictionary *)credentialQuery:(NSString *)key {
  return [@{(__bridge id)kSecClass:(__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService:[[[NSBundle mainBundle] bundleIdentifier] stringByAppendingString:@".sessions"],
    (__bridge id)kSecAttrAccount:key} mutableCopy];
}
RCT_REMAP_METHOD(readCredential, readCredentialKey:(NSString *)key resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  NSMutableDictionary *query=[self credentialQuery:key];
  query[(__bridge id)kSecReturnData]=@YES;
  query[(__bridge id)kSecMatchLimit]=(__bridge id)kSecMatchLimitOne;
  CFTypeRef result=NULL; OSStatus status=SecItemCopyMatching((__bridge CFDictionaryRef)query,&result);
  if(status==errSecItemNotFound){resolve([NSNull null]);return;}
  if(status!=errSecSuccess){reject(@"CREDENTIAL_STORAGE",@"Cannot read saved login",nil);return;}
  NSData *data=CFBridgingRelease(result);
  NSString *value=[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  if(value)resolve(value);else reject(@"CREDENTIAL_STORAGE",@"Cannot read saved login",nil);
}
RCT_REMAP_METHOD(writeCredential, writeCredentialKey:(NSString *)key value:(NSString *)value resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  NSMutableDictionary *query=[self credentialQuery:key];
  NSDictionary *attributes=@{(__bridge id)kSecValueData:[value dataUsingEncoding:NSUTF8StringEncoding],
    (__bridge id)kSecAttrAccessible:(__bridge id)kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly};
  OSStatus status=SecItemUpdate((__bridge CFDictionaryRef)query,(__bridge CFDictionaryRef)attributes);
  if(status==errSecItemNotFound){[query addEntriesFromDictionary:attributes];status=SecItemAdd((__bridge CFDictionaryRef)query,NULL);}
  if(status==errSecSuccess)resolve(nil);else reject(@"CREDENTIAL_STORAGE",@"Cannot save login",nil);
}
RCT_REMAP_METHOD(removeCredential, removeCredentialKey:(NSString *)key resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  OSStatus status=SecItemDelete((__bridge CFDictionaryRef)[self credentialQuery:key]);
  if(status==errSecSuccess||status==errSecItemNotFound)resolve(nil);else reject(@"CREDENTIAL_STORAGE",@"Cannot remove saved login",nil);
}
RCT_REMAP_METHOD(request, requestURL:(NSString *)url method:(NSString *)method headers:(NSDictionary *)headers body:(NSString *)body resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  NSURLComponents *parts = [NSURLComponents componentsWithString:url];
  BOOL allowed = [parts.scheme isEqualToString:@"https"];
#if DEBUG
  NSArray<NSString *> *octets = [parts.host componentsSeparatedByString:@"."];
  BOOL privateHost = octets.count == 4;
  for (NSString *octet in octets) {
    NSInteger number = octet.integerValue;
    if (number < 0 || number > 255 || ![octet isEqualToString:[@(number) stringValue]]) privateHost = NO;
  }
  if (privateHost) {
    NSInteger first = octets[0].integerValue, second = octets[1].integerValue;
    privateHost = first == 10 || (first == 172 && second >= 16 && second <= 31) || (first == 192 && second == 168);
  }
  allowed = allowed || ([parts.scheme isEqualToString:@"http"] && (privateHost || [@"127.0.0.1" isEqualToString:parts.host] || [@"localhost" isEqualToString:parts.host]) && parts.port != nil);
#endif
  if (!allowed || !parts.host.length || parts.user || parts.password || parts.fragment || !parts.URL) { reject(@"INVALID_ENDPOINT", @"Invalid endpoint", nil); return; }
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:parts.URL];
  request.HTTPMethod = method; request.allHTTPHeaderFields = headers;
  if (body) request.HTTPBody = [body dataUsingEncoding:NSUTF8StringEncoding];
  NSURLSessionConfiguration *config = [NSURLSessionConfiguration ephemeralSessionConfiguration];
  config.timeoutIntervalForRequest = 12; config.timeoutIntervalForResource = 12;
  config.HTTPShouldSetCookies = NO; config.URLCredentialStorage = nil; config.URLCache = nil;
  WPRequest *delegate = [WPRequest new]; delegate.resolve=resolve; delegate.reject=reject; delegate.data=[NSMutableData new];
  delegate.session = [NSURLSession sessionWithConfiguration:config delegate:delegate delegateQueue:nil];
  [[delegate.session dataTaskWithRequest:request] resume];
}
- (NSURL *)fileForKey:(NSString *)key error:(NSError **)error {
  NSURL *root = [[[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject URLByAppendingPathComponent:@"WanpetJournal" isDirectory:YES];
  if (![[NSFileManager defaultManager] createDirectoryAtURL:root withIntermediateDirectories:YES attributes:@{NSFileProtectionKey:NSFileProtectionCompleteUntilFirstUserAuthentication} error:error]) return nil;
  [root setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:nil];
  NSData *data=[key dataUsingEncoding:NSUTF8StringEncoding]; unsigned char hash[CC_SHA256_DIGEST_LENGTH]; CC_SHA256(data.bytes,(CC_LONG)data.length,hash);
  NSMutableString *name=[NSMutableString new]; for(int i=0;i<CC_SHA256_DIGEST_LENGTH;i++) [name appendFormat:@"%02x",hash[i]];
  return [root URLByAppendingPathComponent:[name stringByAppendingString:@".json"]];
}
RCT_REMAP_METHOD(read, readKey:(NSString *)key resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  NSError *error=nil; NSURL *file=[self fileForKey:key error:&error];
  if(!file) {reject(@"STORAGE",@"Cannot read journal",nil);return;}
  NSString *value=[NSString stringWithContentsOfURL:file encoding:NSUTF8StringEncoding error:&error];
  if(error && error.code!=NSFileReadNoSuchFileError) reject(@"STORAGE",@"Cannot read journal",nil); else resolve(value ?: (id)[NSNull null]);
}
RCT_REMAP_METHOD(write, writeKey:(NSString *)key value:(NSString *)value resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  NSError *error=nil; NSURL *file=[self fileForKey:key error:&error];
  NSData *data=[value dataUsingEncoding:NSUTF8StringEncoding];
  if(!file || ![data writeToURL:file options:NSDataWritingAtomic | NSDataWritingFileProtectionCompleteUntilFirstUserAuthentication error:&error]) reject(@"STORAGE",@"Cannot save journal",nil); else resolve(nil);
}
RCT_REMAP_METHOD(remove, removeKey:(NSString *)key resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  NSError *error=nil; NSURL *file=[self fileForKey:key error:&error];
  if(!file) {reject(@"STORAGE",@"Cannot remove journal",nil);return;}
  BOOL success=[[NSFileManager defaultManager] removeItemAtURL:file error:&error];
  if(!success && error.code!=NSFileNoSuchFileError) reject(@"STORAGE",@"Cannot remove journal",nil); else resolve(nil);
}
@end
