import { format,parse } from 'date-fns-jalali';
import { toLatinDigits } from './validation';
export const TEHRAN='Asia/Tehran';
export function toJalali(date:Date){return format(date,'yyyy/MM/dd')}
export function toJalaliLong(date:Date){return new Intl.DateTimeFormat('fa-IR',{timeZone:TEHRAN,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(date)}
export function toJalaliDateTime(date:Date){return new Intl.DateTimeFormat('fa-IR',{timeZone:TEHRAN,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date)}
export function fromJalali(date:string){return parse(toLatinDigits(date),'yyyy/MM/dd',new Date())}
export function fromJalaliDateTime(date:string,time:string){const d=fromJalali(date);const [hh,mm]=toLatinDigits(time).split(':').map(Number);d.setHours(hh,mm,0,0);return d}
export function nowJalali(){return toJalaliLong(new Date())}
export function isPast(date:Date){return date.getTime()<Date.now()}
export function jalaliWeekdayIndex(date:Date){return (date.getDay()+1)%7}
export const PERSIAN_WEEKDAYS=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'] as const;
export function persianDay(date:string|Date){return {day:new Intl.DateTimeFormat('fa-IR',{timeZone:TEHRAN,day:'numeric'}).format(new Date(date)),month:new Intl.DateTimeFormat('fa-IR',{timeZone:TEHRAN,month:'long'}).format(new Date(date)),weekday:new Intl.DateTimeFormat('fa-IR',{timeZone:TEHRAN,weekday:'long'}).format(new Date(date))}}

export function mealInstant(day:Date,slot:Date){return new Date(day.toISOString().slice(0,10)+'T'+slot.toISOString().slice(11,19)+'+03:30')}
