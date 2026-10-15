import { config } from 'dotenv';
/** Environment always takes precedence. The local ignored file preserves sandbox keys. */
config({path:'secrets.env',quiet:true});
export class EnvError extends Error {constructor(message:string){super(message);this.name='EnvError'}}
function required(name:string){const value=process.env[name]?.trim();if(!value)throw new EnvError(`متغیر محیطی ${name} تنظیم نشده است`);return value}
function key(name:string){const bytes=Buffer.from(required(name),'base64');if(bytes.length!==32)throw new EnvError(`${name} باید ۳۲ بایت base64 باشد`);return bytes}
export const env={
 get databaseUrl(){return required('DATABASE_URL')},get redisUrl(){return required('REDIS_URL')},get isProduction(){return process.env.NODE_ENV==='production'},get redisStrict(){return process.env.NODE_ENV==='production'},
 get dataEncryptionKey(){return key('DATA_ENCRYPTION_KEY')},get dataHashKey(){return key('DATA_HASH_KEY')},
 get trustedProxyHops(){const n=Number(process.env.TRUSTED_PROXY_HOPS||0);if(!Number.isInteger(n)||n<0||n>10)throw new EnvError('TRUSTED_PROXY_HOPS نامعتبر است');return n},
 get sessionTtlHours(){return 8},get sessionCookieName(){return process.env.SESSION_COOKIE_NAME||'hm_sofreh_session'},get uploadDir(){return process.env.UPLOAD_DIR||'./uploads'},
};
export function assertProductionReady(){env.databaseUrl;env.dataEncryptionKey;env.dataHashKey;if(env.isProduction)env.redisUrl;}
