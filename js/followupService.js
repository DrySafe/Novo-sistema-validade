import {supabase} from './supabaseClient.js';
async function rpc(name,args){const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data;}
export const followupService={
 load:loja=>rpc('vs_acomp_dados',{p_loja:loja}),
 async positions(loja){const {data,error}=await supabase.from('vs_posicoes').select('id,nome,categoria').eq('loja_id',loja).eq('ativa',true).order('nome');if(error)throw new Error(error.message);return data;},
 position:(loja,nome,categoria,id=null,ativa=true)=>rpc('vs_salvar_posicao',{p_loja:loja,p_nome:nome,p_categoria:categoria,p_id:id,p_ativa:ativa}),
 config:(loja,dias,cadencia)=>rpc('vs_salvar_rotina',{p_loja:loja,p_dias:dias,p_cadencia:cadencia}),
 task:(loja,p)=>rpc('vs_criar_tarefa',{p_loja:loja,p}),
 updateTask:(t,estado,resultado)=>rpc('vs_atualizar_tarefa',{p_id:t.id,p_estado:estado,p_resultado:resultado,p_versao:t.versao}),
 move:(item,posicao,motivo)=>rpc('vs_atualizar_posicao',{p_item:item.id,p_posicao:posicao,p_motivo:motivo,p_esperada:item.posicao_id||null}),
 cost:(item,custo,motivo,versao)=>rpc('vs_definir_custo',{p_item:item.id,p_custo:custo,p_motivo:motivo,p_versao:versao}),
 create:p=>rpc('vs_criar_acomp',{p})
};
