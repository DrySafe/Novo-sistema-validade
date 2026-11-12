-- Manutenção explícita, nunca executada no setup nem na lista automática de migrações.
-- Usar dentro de uma transação com:
-- select set_config('validasuper.legacy_admin_email', '<email autorizado>', true);
-- A operação preserva as lojas e os dados; aborta se existirem vínculos ambíguos.
do $$
declare
 email_alvo text := nullif(current_setting('validasuper.legacy_admin_email',true),'');
 alvo perfis;
 lojas_alvo uuid[];
 empresa uuid;
begin
 if email_alvo is null then raise exception 'Informe o e-mail autorizado na configuração da transação'; end if;
 select p.* into alvo from perfis p join auth.users u on u.id=p.id where lower(u.email)=lower(email_alvo) for update of p;
 if alvo.id is null or vs_dono(alvo.id) then raise exception 'Conta inexistente ou CEO: operação não permitida'; end if;
 if alvo.tipo_conta='empresa_admin' and exists(select 1 from vs_empresas where administrador_id=alvo.id and id=alvo.empresa_id) then return; end if;
 if alvo.tipo_conta<>'legado' or alvo.empresa_id is not null or alvo.funcao not in ('administrador','admin') or alvo.senha_inicial then
  raise exception 'Somente administrador legado com senha pessoal pode ser regularizado';
 end if;
 select array_agg(distinct id) into lojas_alvo from (
  select loja_id id from usuario_lojas where usuario_id=alvo.id
  union select alvo.loja_id where alvo.loja_id is not null
 ) s;
 if coalesce(cardinality(lojas_alvo),0)=0 then raise exception 'Conta sem lojas existentes'; end if;
 perform 1 from lojas where id=any(lojas_alvo) order by id for update;
 if (select count(*) from lojas where id=any(lojas_alvo) and empresa_id is null)<>cardinality(lojas_alvo) then
  raise exception 'Loja inexistente ou já vinculada a uma empresa';
 end if;
 if exists(select 1 from perfis p where p.id<>alvo.id and not vs_dono(p.id) and
  (p.loja_id=any(lojas_alvo) or exists(select 1 from usuario_lojas ul where ul.usuario_id=p.id and ul.loja_id=any(lojas_alvo)))) then
  raise exception 'Há outros usuários vinculados às lojas; revisar a regularização manualmente';
 end if;
 insert into vs_empresas(nome,administrador_id) values('Empresa',alvo.id) returning id into empresa;
 update lojas set empresa_id=empresa where id=any(lojas_alvo);
 update perfis set empresa_id=empresa,tipo_conta='empresa_admin' where id=alvo.id;
 insert into vs_acessos_auditoria(ator,usuario,empresa_id,acao,detalhes)
 values(null,alvo.id,empresa,'Regularização autorizada de administrador legado',jsonb_build_object('origem','manutenção administrativa','lojas_preservadas',lojas_alvo));
end $$;
