begin;
create or replace function public.vs_lote(p_loja uuid,p_tipo text) returns setof ciclos_lotes language plpgsql security definer
set search_path=public,pg_temp as $$
declare codigo text; numero text; sufixo text; seq integer; encontrado uuid;
begin
 if not vs_acesso(p_loja) and coalesce(auth.role(),'')<>'service_role' then raise exception 'Loja não autorizada'; end if;
 if p_tipo not in ('VAL','VENC','AV','USO') then raise exception 'Tipo de lote inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_loja::text,0));
 select coalesce(nullif(trim(numero_loja),''),'01') into numero from lojas where id=p_loja;
 if numero is null then raise exception 'Loja inexistente'; end if;
 if length(numero)=1 then numero:='0'||numero; end if;
 sufixo:=to_char(vs_hoje(),case when p_tipo='VAL' then 'MMYYYY' else 'DDMMYYYY' end);
 if p_tipo<>'VAL' then
   select id into encontrado from ciclos_lotes where loja_id=p_loja and codigo_lote like numero||p_tipo||sufixo||'%'
   and status='EM EDIÇÃO' order by created_at limit 1;
   if encontrado is not null then return query select * from ciclos_lotes where id=encontrado; return; end if;
 end if;
 -- A constraint é global: lojas 3 e 03 compartilham o prefixo 03.
 select coalesce(max(greatest(coalesce(sequencia_num,0),right(codigo_lote,4)::integer)),0)+1 into seq
 from ciclos_lotes where left(codigo_lote,length(numero||p_tipo||sufixo))=numero||p_tipo||sufixo
 and length(codigo_lote)=length(numero||p_tipo||sufixo)+4 and right(codigo_lote,4) ~ '^[0-9]{4}$';
 loop
 if seq>9999 then raise exception 'Sequência de lotes excedida'; end if;
 codigo:=numero||p_tipo||sufixo||lpad(seq::text,4,'0');
 return query insert into ciclos_lotes(loja_id,codigo_lote,sequencia_num,status,data_abertura)
 values(p_loja,codigo,seq,'EM EDIÇÃO',now()) on conflict(codigo_lote) do nothing returning *;
 if found then return; end if;
 -- Outra loja pode ter reservado o código depois do MAX: tenta o próximo.
 seq:=seq+1;
 end loop;
end $$;

revoke all on function public.vs_lote(uuid,text) from public,anon,authenticated;
commit;
