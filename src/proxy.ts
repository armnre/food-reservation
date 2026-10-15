import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/server/services/auth';
import { env } from '@/lib/env';
const publicPaths=['/login','/forgot-password','/403','/help','/api/auth/login','/api/health','/api/uploads','/offline.html','/manifest.webmanifest','/sw.js'];
const assets=['/_next/','/brand/','/fonts/','/foods/'];
const roles:Record<string,string[]>={'/student':['STUDENT'],'/staff':['STAFF'],'/vice':['VICE_STUDENT','SUPER_ADMIN'],'/nutrition':['NUTRITION_MANAGER','SUPER_ADMIN'],'/cafeteria':['CAFETERIA_OPERATOR'],'/admin':['SUPER_ADMIN'],'/dev':['SUPER_ADMIN']};
export default async function proxy(request:NextRequest){
 const pathname=request.nextUrl.pathname;
 if(!['GET','HEAD','OPTIONS'].includes(request.method)){
  const origin=request.headers.get('origin');const host=request.headers.get('host');
  if(origin){try{if(new URL(origin).host!==host&&origin!==process.env.APP_URL)return NextResponse.json({error:'درخواست از مبدأ مجاز نیست'},{status:403})}catch{return NextResponse.json({error:'درخواست نامعتبر است'},{status:403})}}
 }
 if(publicPaths.includes(pathname)||assets.some(p=>pathname.startsWith(p)))return NextResponse.next();
 const token=request.cookies.get(env.sessionCookieName)?.value;
 const row=token?await getSessionUser(token):null;
 if(!row||!row.user.isActive||row.user.deletedAt){if(pathname.startsWith('/api/'))return NextResponse.json({error:'نشست معتبر نیست'},{status:401});const url=new URL('/login',request.url);url.searchParams.set('next',pathname+request.nextUrl.search);return NextResponse.redirect(url)}
 const mustChange=row.user.mustChangePassword||row.user.passwordHash===null;
 if(mustChange&&pathname!='/change-password'&&pathname!='/api/auth/logout'){
  if(pathname.startsWith('/api/'))return NextResponse.json({error:'ابتدا رمز شخصی خود را تعیین کنید'},{status:403});return NextResponse.redirect(new URL('/change-password',request.url));
 }
 for(const [prefix,allowed] of Object.entries(roles)){if((pathname===prefix||pathname.startsWith(prefix+'/'))&&!allowed.includes(row.user.role)){return NextResponse.rewrite(new URL('/403',request.url),{status:403})}}
 const response=NextResponse.next();response.headers.set('Cache-Control','private, no-store');
 response.cookies.set(env.sessionCookieName,token!,{httpOnly:true,secure:env.isProduction,sameSite:'lax',path:'/',maxAge:env.sessionTtlHours*3600});
 return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
