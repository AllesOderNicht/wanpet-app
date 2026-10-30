import {RTNGodot,runOnGodotThread} from '@borndotcom/react-native-godot';
import {startEngine,stopEngine,sceneEvents} from '../src/game/engine';

const native=RTNGodot as any;
const run=runOnGodotThread as jest.Mock;
beforeEach(()=>{
  native.createInstance=jest.fn();
  native.destroyInstance=jest.fn();
  native.API=jest.fn(()=>({Engine:{get_main_loop:()=>({get_root:()=>({find_child:()=>({})})})}}));
  run.mockImplementation(async(fn:()=>unknown)=>fn());
});
afterEach(async()=>{await stopEngine();jest.clearAllMocks();});

test('disposes the native instance when scene initialization fails',async()=>{
  native.API.mockImplementation(()=>{throw new Error('scene failed');});
  await expect(startEngine('/resources')).rejects.toThrow('scene failed');
  await stopEngine();
  expect(native.destroyInstance).toHaveBeenCalledTimes(1);
});

test('a new mount waits for the previous instance to stop',async()=>{
  await startEngine('/resources');
  let finish!:()=>void;
  run.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const stop=stopEngine();
  const restart=startEngine('/resources');
  await Promise.resolve();await Promise.resolve();
  expect(native.createInstance).toHaveBeenCalledTimes(1);
  finish();
  await stop;await restart;
  expect(native.createInstance).toHaveBeenCalledTimes(2);
});

test('concurrent starts share one engine initialization',async()=>{
  await Promise.all([startEngine('/resources'),startEngine('/resources')]);
  expect(native.createInstance).toHaveBeenCalledTimes(1);
});

test('table invitations preserve read and reject unsupported invited activities',async()=>{
 const invite={type:'life_request',surface:'interior',event:'invite',intentId:null,target:'sunny',invitedActivity:'read'};
 native.API.mockImplementation(()=>({Engine:{get_main_loop:()=>({get_root:()=>({find_child:()=>({take_events:()=>JSON.stringify([invite,{...invite,invitedActivity:'fly'},{...invite,event:'complete'}])})})})}}));
 expect(await sceneEvents()).toEqual([invite]);
});
