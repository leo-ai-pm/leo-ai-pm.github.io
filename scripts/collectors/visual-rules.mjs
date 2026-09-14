export function createVisualResolver(assets,people) {
const brands=[
 {key:'openai',name:'OpenAI',pattern:/OpenAI|GPT[- ]?\d|Astra|Codex/i,tone:'#e6eeea'},
 {key:'anthropicai',name:'Anthropic',pattern:/Anthropic|Claude|Fable/i,tone:'#eddfd0'},
 {key:'nvidia',name:'NVIDIA',pattern:/NVIDIA|英伟达/i,tone:'#e7edda'},
 {key:'huggingface',name:'Hugging Face',pattern:/Hugging\s?Face/i,tone:'#f3ebd3'},
 {key:'googledeepmind',name:'Google DeepMind',pattern:/Google|DeepMind|WeatherNext|Gemini/i,tone:'#e4eaf4'},
 {key:'perplexity_ai',name:'Perplexity',pattern:/Perplexity|Numbat/i,tone:'#dcebea'},
 {key:'github',name:'GitHub',pattern:/GitHub|Copilot|HydraFusion/i,tone:'#e7e6ec'},
];
function entity(key,name,tone='#e9e4dc') {return {name,asset:assets[key]?.asset || null,assetSource:assets[key]?.page || null,tone};}
return function visualFor(item) {
 const person=people.find(p=>p.handle.toLowerCase()===(item.authorHandle||'').toLowerCase());
 const matches=brands.map(b=>({...b,index:item.title.search(b.pattern)})).filter(b=>b.index>=0).sort((a,b)=>a.index-b.index);
 const entities=matches.map(b=>entity(b.key,b.name,b.tone));
 if(person && (!entities.length || item.title.toLowerCase().startsWith(person.name.split(' ')[0].toLowerCase()) || item.isArchive))entities.unshift(entity(person.handle.toLowerCase(),person.name));
 if(!entities.length)entities.push(entity('',item.sourceName));
 const product=item.title.match(/GPT[- ]6\s*Astra|WeatherNext\s*3|Daybreak|Claude Code|HydraFusion|Numbat|Hermes Agent|IPO/i)?.[0];
 return {entities:entities.slice(0,2),caption:product || item.category,author:person?entity(person.handle.toLowerCase(),person.name):null};
}

}
