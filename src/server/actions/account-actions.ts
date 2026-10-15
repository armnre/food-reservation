'use server';
import { z } from 'zod';
import { hash } from 'argon2';
import { db } from '@/db';
import { users, auditLogs } from '@/db/schema';
import { requireRole } from '@/server/dal/auth';
import { generateTemporaryPassword, normalizePersianText } from '@/lib/validation';
import { canCreateRole } from '@/lib/permissions';
const inputSchema=z.object({displayName:z.string().trim().min(3).max(100),username:z.string().regex(/^[a-zA-Z0-9_.-]{3,64}$/),role:z.enum(['VICE_STUDENT','NUTRITION_MANAGER'])});
export async function createManagerAction(input:unknown){const {user}=await requireRole('SUPER_ADMIN');const parsed=inputSchema.safeParse(input);if(!parsed.success)return {ok:false as const,error:'نام حداقل سه حرف و نام کاربری لاتین معتبر لازم است.'};const data=parsed.data;if(!canCreateRole(user.role,data.role))return {ok:false as const,error:'ایجاد این نقش مجاز نیست'};const temporary=generateTemporaryPassword(16);const passwordHash=await hash(temporary,{type:2,memoryCost:65536,timeCost:3});try{await db.transaction(async tx=>{const [created]=await tx.insert(users).values({username:data.username,displayName:normalizePersianText(data.displayName),role:data.role,passwordHash,mustChangePassword:true,createdBy:user.id}).returning({id:users.id});await tx.insert(auditLogs).values({actorId:user.id,actorRole:user.role,action:'user:created',entityType:'user',entityId:created.id,after:{username:data.username,role:data.role}})});return {ok:true as const,temporary}}catch{return {ok:false as const,error:'حساب ایجاد نشد؛ نام کاربری نباید تکراری باشد.'}}}
