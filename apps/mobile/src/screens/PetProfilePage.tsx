import React,{useEffect,useState} from 'react';
import {StyleSheet,Text,TextInput,View} from 'react-native';
import type {PetProfileRequest,PetProfileView} from '../../../../packages/contracts/src/index';
import {Action,colors,Copy,Empty,Page,s,titleFont} from './shared';

type Props={profile?:PetProfileView|null;busy:boolean;onSave:(request:PetProfileRequest)=>Promise<void>;close:()=>void;closeLabel?:string};
type Fields=Omit<PetProfileRequest,'expectedRevision'>;
type Form={petId:string;revision:number;initial:Fields;draft:Fields;error:string|null;saved:boolean;awaitingRefresh:boolean};
const voices=[{id:'gentle',label:'温柔'},{id:'playful',label:'活泼'},{id:'quiet',label:'安静'}] as const;
const traits=[{id:'curiosity',label:'好奇心',help:'遇到新事物时，愿意靠近多少。'},{id:'sociability',label:'亲近感',help:'平时喜欢有多少陪伴。'},{id:'sensitivity',label:'敏感度',help:'对声音和周围变化的留意程度。'}] as const;
const levels=[{label:'低',value:.2},{label:'中',value:.5},{label:'高',value:.8}];
function fields(profile:PetProfileView):Fields{return {nickname:profile.nickname,description:profile.description,voice:profile.voice,temperament:{...profile.temperament}};}
function fromProfile(profile:PetProfileView):Form{return {petId:profile.petId,revision:profile.revision,initial:fields(profile),draft:fields(profile),error:null,saved:false,awaitingRefresh:false};}
function changed(form:Form){return form.draft.nickname!==form.initial.nickname||form.draft.description!==form.initial.description||form.draft.voice!==form.initial.voice||traits.some(trait=>form.draft.temperament[trait.id]!==form.initial.temperament[trait.id]);}

export function PetProfilePage({profile,busy,onSave,close,closeLabel='回去陪它'}:Props) {
 const [form,setForm]=useState<Form|null>(()=>profile?fromProfile(profile):null),[saving,setSaving]=useState(false);
 useEffect(()=>{
  if(!profile)return;
  setForm(current=>{
   if(!current||current.petId!==profile.petId)return fromProfile(profile);
   if(profile.revision<=current.revision||changed(current))return current;
   return {...fromProfile(profile),saved:current.saved};
  });
 },[profile,form?.awaitingRefresh]);
 const dirty=!!form&&changed(form),conflict=!!form&&!!profile&&form.petId===profile.petId&&profile.revision>form.revision&&dirty;
 const waiting=!!form?.awaitingRefresh,locked=busy||saving||waiting||!profile||profile.petId!==form?.petId;
 const valid=!!form?.draft.nickname.trim()&&form.draft.nickname.trim().length<=24&&form.draft.description.trim().length<=500;
 function edit(patch:Partial<Fields>){setForm(current=>current?{...current,draft:{...current.draft,...patch},error:null,saved:false}:current);}
 async function save(){
  if(!form||locked||!dirty||!valid||conflict)return;
  const submitted={...form.draft,nickname:form.draft.nickname.trim(),description:form.draft.description.trim(),temperament:{...form.draft.temperament}};
  const petId=form.petId,revision=form.revision;
  setSaving(true);setForm(current=>current?{...current,error:null,saved:false}:current);
  try{
   await onSave({...submitted,expectedRevision:revision});
   setForm(current=>current?.petId===petId&&current.revision===revision?{...current,initial:submitted,draft:submitted,saved:true,awaitingRefresh:true}:current);
  }catch(error){
   setForm(current=>current?.petId===petId?{...current,error:error instanceof Error?error.message:'这次没保存成功，输入还在，可以再试一次。'}:current);
  }finally{setSaving(false);}
 }
 return <Page title="认识这位小伙伴" subtitle="记下它的名字、性格和说话时的感觉" footer={<><Action label={saving?'正在保存…':waiting?'已保存，正在更新…':'保存小伙伴资料'} primary disabled={locked||!dirty||!valid||conflict} onPress={()=>{void save();}}/><Action label={closeLabel} onPress={close}/></>}>
  {!form?<Empty icon="cat" title="资料还没送到"><Copy>等小屋更新后，就能继续认识它了。</Copy></Empty>:<>
   <View style={s.field}><Text style={s.label}>它的昵称</Text><TextInput accessibilityLabel="宠物昵称" value={form.draft.nickname} onChangeText={nickname=>edit({nickname})} maxLength={24} autoCorrect={false} editable={!locked} placeholder="你想怎样称呼它" placeholderTextColor={colors.muted} style={s.input}/><Copy style={styles.note}>最多 24 个字。</Copy></View>
   <View style={s.field}><Text style={s.label}>关于它</Text><TextInput accessibilityLabel="宠物描述" value={form.draft.description} onChangeText={description=>edit({description})} maxLength={500} multiline textAlignVertical="top" editable={!locked} placeholder="比如喜欢待在哪里，有哪些小习惯……" placeholderTextColor={colors.muted} style={[s.input,styles.description]}/><Copy style={styles.note}>{form.draft.description.length} / 500</Copy></View>
   <Text accessibilityRole="header" style={styles.heading}>说话的感觉</Text><View style={styles.choices}>{voices.map(voice=><View key={voice.id} style={styles.choice}><Action label={`${voice.label}${form.draft.voice===voice.id?' · 已选':''}`} primary={form.draft.voice===voice.id} disabled={locked} onPress={()=>edit({voice:voice.id})}/></View>)}</View>
   <Text accessibilityRole="header" style={styles.heading}>性格的三个侧面</Text><Copy>这些倾向会影响它的选择，也给聊天一点自己的语气。</Copy>
   {traits.map(trait=>{const level=form.draft.temperament[trait.id]<1/3?0:form.draft.temperament[trait.id]>2/3?2:1;return <View key={trait.id} style={styles.trait}><Text style={styles.label}>{trait.label}</Text><Copy style={styles.note}>{trait.help}</Copy><View style={styles.choices}>{levels.map((option,index)=><View key={option.label} style={styles.choice}><Action label={`${trait.label}${option.label}${level===index?' · 已选':''}`} primary={level===index} disabled={locked} onPress={()=>edit({temperament:{...form.draft.temperament,[trait.id]:option.value}})}/></View>)}</View></View>;})}
   {conflict&&<View style={s.alert}><Text accessibilityRole="alert" style={s.alertCopy}>别处更新了它的资料。你还没保存的内容会先留在这里，载入最新资料会舍弃这份草稿。</Text><Action label="舍弃草稿，载入最新资料" disabled={busy||saving} onPress={()=>{if(profile)setForm(fromProfile(profile));}}/></View>}
   {form.error&&<Text accessibilityRole="alert" style={styles.error}>{form.error} 输入已保留。</Text>}
   {form.saved&&<Text accessibilityLiveRegion="polite" style={styles.saved}>{waiting?'资料已保存，正在等小屋更新。':'资料已保存。'}</Text>}
  </>}
 </Page>;
}
const styles=StyleSheet.create({heading:{fontFamily:titleFont,fontSize:18,color:colors.ink,marginTop:12},description:{minHeight:112},note:{fontSize:12,lineHeight:20},choices:{flexDirection:'row',flexWrap:'wrap',gap:8},choice:{flexGrow:1,flexBasis:'30%',minWidth:80},trait:{gap:8,paddingVertical:8,borderBottomWidth:1,borderColor:colors.line},label:{fontSize:14,color:colors.ink},error:{fontSize:13,lineHeight:22,color:'#844c31'},saved:{fontSize:13,lineHeight:22,color:colors.green}});
