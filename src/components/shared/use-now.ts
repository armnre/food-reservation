'use client';
import { useSyncExternalStore } from 'react';
let now=Date.now();
const callbacks=new Set<()=>void>();let interval:ReturnType<typeof setInterval>|null=null;
function subscribe(callback:()=>void){callbacks.add(callback);if(!interval){interval=setInterval(()=>{now=Date.now();callbacks.forEach(cb=>cb())},1000)}return()=>{callbacks.delete(callback);if(!callbacks.size&&interval){clearInterval(interval);interval=null}}}
export function useNow(){return useSyncExternalStore(subscribe,()=>now,()=>0)}
