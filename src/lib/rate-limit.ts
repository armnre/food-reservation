import Redis from 'ioredis';
import { env } from './env';
let client:Redis|null=null;
export async function getRedis():Promise<Redis>{if(!client){client=new Redis(env.redisUrl,{lazyConnect:true,connectTimeout:2500,commandTimeout:3500,maxRetriesPerRequest:1,retryStrategy:times=>Math.min(200*2**Math.min(times,4),3000)});client.on('error',()=>{});}if(client.status==='wait')await client.connect();if(client.status!=='ready')await client.ping();return client;}
export async function redisHealth(){try{return {ok:(await(await getRedis()).ping())==='PONG',detail:'redis: ok'}}catch{return {ok:false,detail:'redis: unavailable'}}}
type Entry={value:string;expires:number};const memory=new Map<string,Entry>();
function fallback(error:unknown){if(env.isProduction)throw error;}
export async function kvGet(key:string){try{return await(await getRedis()).get(key)}catch(e){fallback(e);const v=memory.get(key);if(v&&v.expires>Date.now())return v.value;memory.delete(key);return null}}
export async function kvSet(key:string,value:string,seconds:number){try{await(await getRedis()).set(key,value,'EX',seconds)}catch(e){fallback(e);memory.set(key,{value,expires:Date.now()+seconds*1000})}}
export async function kvDel(key:string){try{await(await getRedis()).del(key)}catch(e){fallback(e);memory.delete(key)}}
export async function kvTake(key:string){try{return await(await getRedis()).getdel(key)}catch(e){fallback(e);const value=await kvGet(key);memory.delete(key);return value}}
export async function kvTtl(key:string){try{return Math.max(0,await(await getRedis()).ttl(key))}catch(e){fallback(e);return Math.max(0,Math.ceil(((memory.get(key)?.expires??0)-Date.now())/1000))}}
export async function kvIncrWindow(key:string,seconds:number):Promise<number>{try{return Number(await(await getRedis()).eval("local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end;return n",1,key,seconds))}catch(e){fallback(e);const now=Date.now();const existing=memory.get(key);const count=existing&&existing.expires>now?Number(existing.value)+1:1;memory.set(key,{value:String(count),expires:count===1?now+seconds*1000:existing!.expires});return count}}
export async function kvFlushAll(){if(process.env.NODE_ENV!=='test')throw new Error('Test only');memory.clear();const r=await getRedis();const keys=await r.keys('test:*');if(keys.length)await r.del(...keys)}
export async function closeRedis(){client?.disconnect();client=null}
