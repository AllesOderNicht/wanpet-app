import React,{useState} from 'react';
import {SafeAreaView,Text} from 'react-native';
import {AppShell} from './src/AppShell';
import {createSession,nativePlatform} from './src/session/platform';
export default function App(){
 const[setup]=useState(()=>{try{const platform=nativePlatform();return {platform,session:createSession(platform,__DEV__),error:null};}catch(error){return {platform:null,session:null,error:String(error)};}});
 if(!setup.platform||!setup.session)return <SafeAreaView><Text accessibilityRole="alert">无法启动丸宠：{setup.error}</Text></SafeAreaView>;
 return <AppShell platform={setup.platform} session={setup.session}/>;
}
