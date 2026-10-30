import React,{type PropsWithChildren} from 'react';
import {Platform,requireNativeComponent,StyleSheet,View,type StyleProp,type ViewProps,type ViewStyle} from 'react-native';
import {Icon,type IconName} from '../screens/shared';

const NativeGlass=Platform.OS==='ios'?requireNativeComponent<ViewProps>('WanpetGlassView'):null;
const NativeSymbol=Platform.OS==='ios'?requireNativeComponent<ViewProps&{symbol:string}>('WanpetSymbolView'):null;
const symbols={settings:'gearshape',chat:'bubble.left.and.bubble.right',status:'pawprint',door:'door.left.hand.open',home:'house',collection:'photo.on.rectangle.angled',bag:'bag'};
const fallback:Record<keyof typeof symbols,IconName>={settings:'settings',chat:'mail',status:'paw',door:'leaf',home:'home',collection:'book',bag:'bag'};

export function GlassIcon({name,size=22}:{name:keyof typeof symbols;size?:number}) {
 return NativeSymbol?<NativeSymbol accessible={false} symbol={symbols[name]} style={{width:size,height:size}}/>:<Icon name={fallback[name]} size={size} color="#493e30"/>;
}

export function GlassSurface({children,style}:PropsWithChildren<{style?:StyleProp<ViewStyle>}>) {
 const radius=StyleSheet.flatten(style)?.borderRadius??28;
 return <View style={[styles.shadow,style]}>
  <View style={[styles.surface,{borderRadius:radius}]}>
   {NativeGlass?<NativeGlass pointerEvents="none" style={StyleSheet.absoluteFill}/>:<View pointerEvents="none" style={[StyleSheet.absoluteFill,styles.fallback]}/>}
   {children}
  </View>
 </View>;
}
const styles=StyleSheet.create({shadow:{shadowColor:'#34291d',shadowOffset:{width:0,height:5},shadowRadius:12,shadowOpacity:.15,elevation:5},surface:{flex:1,overflow:'hidden'},fallback:{backgroundColor:'#fff7e9ed',borderWidth:StyleSheet.hairlineWidth,borderColor:'#ffffffa8',borderRadius:28}});
