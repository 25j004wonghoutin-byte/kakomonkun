export function startRankingPolling({refresh,visibility,subscribe}:{refresh:()=>Promise<unknown>;visibility:()=>boolean;subscribe:(callback:()=>void)=>()=>void}):()=>void{
  let stopped=false,running=false;
  function update(){
    if(stopped||running||!visibility())return;
    running=true;Promise.resolve().then(refresh).catch(()=>undefined).finally(()=>{running=false;});
  }
  const timer=setInterval(update,15000),unsubscribe=subscribe(update);
  return()=>{stopped=true;clearInterval(timer);unsubscribe();};
}

/** 月/試験の切替やunmount後に古い結果を描画しない。 */
export function createRankingLoader<T>(load:(key:string)=>Promise<T>,publish:(value:T)=>void){
  let sequence=0,disposed=false;
  return {
    async refresh(key:string):Promise<void>{const request=++sequence;const value=await load(key);if(!disposed&&request===sequence)publish(value);},
    dispose(){disposed=true;sequence++;},
  };
}
