import { useEffect, useState } from 'react';
import { ApiRequestError } from '@study-accelerator/web-core';
import { Button } from '../../components/ui/button/Button';
import { TextField } from '../../components/ui/input/Input';
import { modelSettings, type ModelSettingsStatus } from './modelSettings';
import styles from './SettingsView.module.css';

export function ModelConnectionSettings() {
  const [status, setStatus] = useState<ModelSettingsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [modelId, setModelId] = useState('deepseek-flash');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    modelSettings.status().then(value => {
      if (active) { setStatus(value); setModelId(value.modelId); }
    }).catch((failure: unknown) => {
      if (!active) return;
      setError(failure instanceof ApiRequestError && failure.status === 404
        ? '当前 API 服务未提供模型配置接口，请更新或重启 API 服务后重试。'
        : '无法读取模型配置状态，请检查当前服务后重试。');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadAttempt]);

  async function perform(action: 'save' | 'check' | 'remove') {
    setBusy(true); setNotice(''); setError('');
    try {
      const next = action === 'save'
        ? await modelSettings.save({ modelId, apiKey })
        : action === 'check' ? await modelSettings.check() : await modelSettings.remove();
      setStatus(next);
      setModelId(next.modelId);
      setApiKey('');
      setNotice(action === 'save' ? '配置已保存。请使用“检查连接”确认密钥及模型可见。'
        : action === 'check' ? '连接成功：密钥有效，所选模型在账号模型列表中。'
          : '模型配置已移除。');
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : '操作失败，请重试。';
      setError(message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
    } finally { setBusy(false); }
  }

  return <section className={styles.group} aria-labelledby="settings-model-heading">
    <h3 id="settings-model-heading">模型接入</h3>
    <div className={styles.settingList}>
      <div className={styles.modelContent}>
        <div className={styles.settingCopy}>
          <h4>DeepSeek</h4>
          <p>配置保存在当前运行端。Mac 版使用系统钥匙串加密；网页版由服务器保存。API Key 不会在此页再次显示。</p>
        </div>
        <div className={styles.modelFields}>
          <TextField label="模型 ID" value={modelId} onChange={setModelId} isDisabled={busy} description="默认 deepseek-flash；请填写您账号可用的模型 ID。" />
          <TextField label="API Key" type="password" value={apiKey} onChange={setApiKey} isDisabled={busy} description={status?.configured ? '留空可保留已保存的密钥；输入新密钥可替换。' : '密钥只用于连接 DeepSeek，请在此输入，不要发给他人。'} />
        </div>
        <p className={styles.modelState}>{loading ? '正在读取配置…' : status === null ? '配置状态读取失败' : status.configured ? `已配置 · ${status.modelId}` : '尚未配置'}</p>
        <div className={styles.modelActions}>
          <Button variant="primary" size="compact" isDisabled={busy || loading || status === null || !modelId.trim() || (!status.configured && !apiKey.trim())} onPress={() => void perform('save')}>保存配置</Button>
          <Button size="compact" isDisabled={busy || loading || !status?.configured || modelId !== status.modelId || Boolean(apiKey)} onPress={() => void perform('check')}>检查连接</Button>
          <Button variant="danger" size="compact" isDisabled={busy || loading || !status?.configured} onPress={() => void perform('remove')}>移除配置</Button>
          {status === null && !loading ? <Button size="compact" isDisabled={busy} onPress={() => setLoadAttempt(value => value + 1)}>重试读取</Button> : null}
        </div>
        {notice ? <p role="status" className={styles.modelNotice}>{notice}</p> : null}
        {error ? <p role="alert" className={styles.modelError}>{error}</p> : null}
        <p className={styles.modelHint}>连接检查仅读取 DeepSeek 的账号模型列表，不发送笔记，也不执行生成。AI 助手与 10 元每日预算仍待后续阶段接通。</p>
      </div>
    </div>
  </section>;
}
