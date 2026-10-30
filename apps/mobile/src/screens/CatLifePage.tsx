import React,{type ReactNode} from 'react';
import {StyleSheet,Text,View} from 'react-native';
import type {CatActivity,CatLifeView} from '../../../../packages/contracts/src/index';
import {Action,colors,Copy,Empty,Page,titleFont} from './shared';

type Props={life?:CatLifeView|null;nickname?:string;overview?:ReactNode;close:()=>void;onCushion:(spot:'sunny'|'shelter')=>void;busy?:boolean;onCare?:(operation:'feed'|'refill_water'|'clean_toilet',source:'basic'|'inventory')=>void;onInvite?:(activity:CatActivity)=>void};
function percent(value?:number){return typeof value==='number'&&Number.isFinite(value)?Math.round(Math.max(0,Math.min(1,value))*100):null;}
function Need({label,value}:{label:string;value?:number}) {
 const amount=percent(value),description=amount===null?'还没记录':`${amount}%`;
 return <View accessible accessibilityLabel={`${label}，${description}`} style={styles.need}><Text style={styles.needLabel}>{label}</Text><View style={styles.track}>{amount!==null&&<View style={[styles.fill,{width:`${amount}%`}]}/>}</View><Text style={styles.needValue}>{description}</Text></View>;
}
export function CatLifePage({life,nickname,overview,close,onCushion,busy=false,onCare,onInvite}:Props) {
 const temperament=life?.profile?.temperament??life?.temperament,facilities=life?.facilities;
 const traits=temperament?[temperament.curiosity>.5?'喜欢四处看看':'喜欢熟悉的地方',temperament.sociability>.5?'愿意靠近你':'亲近也有自己的节奏',temperament.sensitivity>.5?'对动静比较敏感':'遇事慢悠悠']:[];
 const mood=life?.mood?{relaxed:'悠闲自在',curious:'有些好奇',happy:'心情不错',sleepy:'有点困了',uneasy:'想安静一会儿'}[life.mood.label]:null;
 const careDisabled=busy||!facilities||!onCare,toiletOccupied=life?.intent?.activity==='toilet';
 const foodFull=!!facilities&&facilities.food.portions>=3,waterFull=!!facilities&&facilities.water.portions>=3;
 const toiletClean=!!facilities&&facilities.toilet.uses===0&&facilities.toilet.cleanliness>=1;
 return <Page title="状态" subtitle={nickname||life?.profile?`${nickname??life?.profile?.nickname}的吃喝、休息和一点陪伴`:'看看它需要什么，也留一点自己的时间'} footer={<Action label="回去陪它" onPress={close}/>}>
  {overview}
  {mood&&<Text style={styles.mood}>此刻 · {mood}</Text>}
  <View style={styles.needs}><Need label="饥饿" value={life?.needs.hunger}/><Need label="精力" value={life?.mood?.energy??(life?1-life.needs.fatigue:undefined)}/><Need label="口渴" value={life?.body?.thirst}/></View>
  {(!life?.body||!facilities)&&<Copy style={styles.note}>{life?'新的照顾记录还没送到。已有的小事和软垫位置会保留。':'还没收到小屋的生活记录，稍后回来看看。'}</Copy>}
  <Text accessibilityRole="header" style={styles.heading}>添一点吃喝</Text>
  <Copy>{facilities?`食盆里还有 ${facilities.food.portions} 份${foodFull?'，已经盛满了。':'。'}`:'食盆的份数还没更新。'}</Copy>
  <View style={styles.actions}><View style={styles.action}><Action label="添一份基础口粮" primary disabled={careDisabled||foodFull} onPress={()=>onCare?.('feed','basic')}/></View><View style={styles.action}><Action label="用一份背包食物" disabled={careDisabled||foodFull} onPress={()=>onCare?.('feed','inventory')}/></View></View>
  <Copy style={styles.note}>基础口粮不动背包；选用背包食物会扣除 1 份旅行食物。</Copy>
  <View style={styles.facility}><Copy>{facilities?`水碗里还有 ${facilities.water.portions} 份${waterFull?'，已经添满了。':'。'}`:'水碗的份数还没更新。'}</Copy><Action label="添满清水" disabled={careDisabled||waterFull} onPress={()=>onCare?.('refill_water','basic')}/></View>
  <Text accessibilityRole="header" style={styles.heading}>收拾猫砂盆</Text>
  <Copy>{facilities?`干净程度 ${percent(facilities.toilet.cleanliness)}% · 已使用 ${facilities.toilet.uses} 次`:'猫砂盆的记录还没更新。'}</Copy>
  {toiletOccupied&&<Copy style={styles.note}>它正在使用，等它出来再清理。</Copy>}
  <Action label={toiletClean?'猫砂盆还很干净':'清理猫砂盆'} disabled={careDisabled||toiletOccupied||toiletClean} onPress={()=>onCare?.('clean_toilet','basic')}/>
  <Text accessibilityRole="header" style={styles.heading}>想邀请它做什么</Text><Copy>轻轻招呼一声。它会按自己的状态决定，不一定马上过来。</Copy>
  {life?.activities?.length?<View style={styles.actions}>{life.activities.map(activity=><View key={activity.id} style={styles.action}><Action label={`邀请它${activity.label}`} disabled={busy||!onInvite||!activity.available} onPress={()=>onInvite?.(activity.id)}/>{!activity.available&&activity.reason&&<Copy style={styles.reason}>{activity.reason}</Copy>}</View>)}</View>:<Copy style={styles.note}>等活动记录更新后，再邀请它做点小事。</Copy>}
  {!!traits.length&&<View style={styles.traits}>{traits.map(text=><Text key={text} style={styles.trait}>{text}</Text>)}</View>}
  <Text accessibilityRole="header" style={styles.heading}>留一处舒服的位置</Text><Copy>把软垫放好，等它自己来。它也可能更喜欢原来的角落。</Copy>
  <View style={styles.places}><Action label={life?.cushion==='sunny'?'软垫在亮处':'把软垫放到亮处'} disabled={busy||!life||life.cushion==='sunny'} onPress={()=>onCushion('sunny')}/><Action label={life?.cushion==='shelter'?'软垫在安静角落':'把软垫放到安静角落'} disabled={busy||!life||life.cushion==='shelter'} onPress={()=>onCushion('shelter')}/></View>
  <Text accessibilityRole="header" style={styles.heading}>最近的小事</Text>
  {life?.memories.length?life.memories.map(memory=><View key={memory.id} style={styles.memory}><Text style={styles.time}>{new Date(memory.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}{memory.kind==='away'?' · 离开期间':''}</Text><Copy>{memory.text}</Copy></View>):<Empty icon="paw" title="先陪它待一会儿"><Copy>吃饭、打盹、张望过的片刻，会慢慢留在这里。</Copy></Empty>}
 </Page>;
}
const styles=StyleSheet.create({mood:{fontFamily:titleFont,fontSize:18,color:colors.ink},needs:{borderTopWidth:1,borderBottomWidth:1,borderColor:colors.line,paddingVertical:5},need:{minHeight:38,flexDirection:'row',alignItems:'center',gap:12},needLabel:{width:38,fontSize:13,color:colors.ink},needValue:{width:64,fontSize:12,color:colors.muted,textAlign:'right'},track:{flex:1,height:5,borderRadius:3,backgroundColor:'#e9ddc8',overflow:'hidden'},fill:{height:5,backgroundColor:colors.green},traits:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},trait:{fontSize:12,color:colors.ink,backgroundColor:colors.selected,paddingHorizontal:10,paddingVertical:7,borderRadius:12},heading:{fontFamily:titleFont,fontSize:18,color:colors.ink,marginTop:12},actions:{flexDirection:'row',flexWrap:'wrap',gap:8},action:{flexGrow:1,flexBasis:'45%',minWidth:120},facility:{borderTopWidth:1,borderColor:colors.line,paddingTop:12},reason:{fontSize:11,lineHeight:18,textAlign:'center'},places:{gap:8},memory:{borderLeftWidth:2,borderColor:'#d3d9bc',paddingLeft:14,paddingVertical:8,marginTop:6},time:{fontSize:11,color:colors.muted,marginBottom:5},note:{fontSize:12,lineHeight:20}});
