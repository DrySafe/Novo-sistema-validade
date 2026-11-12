import {supabase} from './supabaseClient.js';
async function rpc(name,args){const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data;}
export const notificationService={
 count:()=>rpc('vs_contar_notificacoes'),
 load:state=>rpc('vs_notificacoes_dados',{p_loja:state.loja||null,p_tipo:state.tipo||null,p_papel:state.papel||null,p_nao_lidas:state.unread,p_antes:state.cursor?.date||null,p_antes_id:state.cursor?.id||null}),
 mark:ids=>rpc('vs_ler_notificacoes',{p_ids:ids}),
 decide:(request,approved,reason)=>rpc('vs_decidir_loja',{p_id:request.id,p_aprovar:approved,p_motivo:reason,p_versao:request.versao}),
 send:payload=>rpc('vs_enviar_aviso',payload)
};
