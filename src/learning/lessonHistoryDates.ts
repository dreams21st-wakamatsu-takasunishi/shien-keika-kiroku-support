import {isServiceDate} from './contracts';

export function shiftServiceDate(date:string,days:number):string {
 if(!isServiceDate(date))throw Error('日付を確認してください。');
 const value=new Date(`${date}T00:00:00Z`);
 value.setUTCDate(value.getUTCDate()+days);
 return value.toISOString().slice(0,10);
}

export function isLessonSourceDate(sourceDate:string,recordDate:string):boolean {
 return isServiceDate(sourceDate)&&isServiceDate(recordDate)
  &&sourceDate>=shiftServiceDate(recordDate,-3)&&sourceDate<=recordDate;
}
