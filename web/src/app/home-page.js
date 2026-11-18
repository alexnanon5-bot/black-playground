'use client';

import { useEffect, useRef, useState } from 'react';
import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import classNames from 'classnames';
import { useDebounceValue } from 'usehooks-ts';
import Header from '../components/header';
import Sidebar from '../components/sidebar';
import Icon from '../components/icon';
import Spinner from '../components/spinner';
import { formatByVersion } from '../lib/api';
import { isRuntimeLog } from '../lib/runtime-log.mjs';

const MANUAL_THRESHOLD = 32_000;
const PREVIEW_LIMIT = 32_000;
const SHARE_STATE_LIMIT = 1_800;

const Editor = dynamic(() => import('../components/editor'), { ssr: false });

export default function HomePage({ props }) {
  const editor = useRef(null);
  const [version, setVersion] = useState(props.version);
  const [source, setSource] = useState(props.source);
  const [isLoading, setIsLoading] = useState(false);
  const [formatted, setFormatted] = useState(props.formatted);
  const [options, setOptions] = useState(props.options);
  const [state, setState] = useState(props.state);
  const [error, setError] = useState('');
  const [submittedSource, setSubmittedSource] = useState(null);
  const isLong = source.length > MANUAL_THRESHOLD;
  const runtimeLog = isRuntimeLog(source);
  const previewTruncated = formatted.length > PREVIEW_LIMIT;
  const [issueLink, setIssueLink] = useState(props.issueLink);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [debouncedSource] = useDebounceValue(source, 100);
  const [debouncedOptions] = useDebounceValue(options, 100);
  const [debouncedVersion] = useDebounceValue(version, 100);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (localStorage.getItem('sidebar:visible') === 'true') {
        setIsSidebarVisible(true);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar:visible', isSidebarVisible);
    }
  }, [isSidebarVisible]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!runtimeLog && !isLong && state && state.length <= SHARE_STATE_LIMIT) {
      url.searchParams.set('version', version);
      url.searchParams.set('state', state);
    } else {
      url.searchParams.delete('state');
      url.searchParams.delete('version');
    }
    if (url.href !== window.location.href) {
      window.history.replaceState(null, '', url);
    }
  }, [runtimeLog, isLong, version, state]);

  useEffect(() => {
    const input = isLong ? submittedSource?.source ?? null : debouncedSource;
    const inputVersion = isLong ? version : debouncedVersion;
    const inputOptions = isLong ? options : debouncedOptions;
    if (input === null || input !== source || inputVersion !== version || inputOptions !== options) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    const worker = isRuntimeLog(input)
      ? new Worker(new URL('../lib/runtime-log.worker.mjs', import.meta.url))
      : null;
    setError('');
    setIsLoading(true);
    const timeout = setTimeout(() => {
      controller.abort();
      worker?.terminate();
      setError('处理超时，请缩短输入后重试。');
      setIsLoading(false);
    }, 30_000);
    const finish = () => {
      clearTimeout(timeout);
      worker?.terminate();
      setIsLoading(false);
    };
    if (worker) {
      worker.onmessage = ({ data }) => {
        setFormatted(data.formatted ?? '');
        setError(data.error ?? '');
        setState(null);
        setIssueLink(null);
        finish();
      };
      worker.onerror = () => {
        setError('日志处理失败，请重试。');
        finish();
      };
      worker.postMessage(input);
    } else {
      formatByVersion(inputVersion, {
        source: input,
        options: inputOptions,
      }, controller.signal).then((json) => {
        if (controller.signal.aborted) return;
        setFormatted(json.formatted_code);
        setState(isLong ? null : json.state);
        setIssueLink(isLong ? null : json.issue_link);
        finish();
      }).catch(() => {
        if (controller.signal.aborted) return;
        setError('格式化服务未返回结果，请重试。');
        finish();
      });
    }
    return () => {
      clearTimeout(timeout);
      controller.abort();
      worker?.terminate();
    };
  }, [source, version, options, debouncedSource, debouncedVersion, debouncedOptions, isLong, submittedSource]);

  const handleLargePaste = (event) => {
    const pasted = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
    if (source.length + pasted.length <= MANUAL_THRESHOLD || !editor.current) return;
    const ace = editor.current;
    const range = ace.getSelectionRange();
    const start = ace.session.doc.positionToIndex(range.start);
    const end = ace.session.doc.positionToIndex(range.end);
    if (source.length - (end - start) + pasted.length <= MANUAL_THRESHOLD) return;
    event.preventDefault();
    event.stopPropagation();
    handleSourceUpdate(source.slice(0, start) + pasted + source.slice(end));
  };

  const downloadResult = () => {
    const url = URL.createObjectURL(new Blob([formatted], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = runtimeLog ? 'runtime-formatted.txt' : 'formatted.py';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleOptionsUpdate = (value) => {
    setSubmittedSource(null);
    if (value.version) {
      setVersion(value.version);
    } else {
      setOptions((prev) => Object.assign({}, prev, value));
    }
  };

  const handleSourceUpdate = (value) => {
    setSubmittedSource(null);
    setError('');
    setFormatted('');
    setIssueLink(null);
    setState(null);
    setSource(value);
  };

  const handleToggleSidebar = () => {
    setIsSidebarVisible((prev) => !prev);
  };

  return (
    <div className="flex flex-col h-screen">
      <Header version={version === 'stable' ? `v${props.versions.stable}` : `@${props.versions.main}`} />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 min-h-0">
          <Sidebar
            version={version}
            versions={props.versions}
            options={options}
            visible={isSidebarVisible}
            onChange={handleOptionsUpdate}
          />
          <div className="flex flex-1 min-w-0">
            <div className="flex flex-1 min-w-0 relative" onPasteCapture={isLong ? undefined : handleLargePaste}>
              {isLong ? (
                <textarea
                  className="w-full resize-none bg-slate-900 text-white font-mono"
                  aria-label="长文本输入"
                  spellCheck={false}
                  wrap="off"
                  value={source}
                  onChange={(event) => handleSourceUpdate(event.target.value)}
                />
              ) : (
                <Editor
                  value={source}
                  marginColumn={options.line_length}
                  onChange={handleSourceUpdate}
                  onLoad={(ace) => { editor.current = ace; }}
                />
              )}
            </div>
            <div className="flex flex-1 min-w-0 relative">
              {isLoading ? (
                <div className="flex items-center justify-center w-full ace-tomorrow-night">
                  <Spinner />
                </div>
              ) : previewTruncated ? (
                <textarea
                  className="w-full resize-none bg-slate-900 text-white font-mono"
                  aria-label="格式化预览"
                  readOnly
                  wrap="off"
                  value={formatted.slice(0, PREVIEW_LIMIT)}
                />
              ) : (
                <Editor
                  value={formatted}
                  marginColumn={options.line_length}
                  readOnly={true}
                />
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-between content-center items-center p-4">
          <button
            className={classNames('text-sm inline-flex items-center', {
              'text-black': isSidebarVisible,
              'hover:text-slate-500': isSidebarVisible,
              'text-slate-500': !isSidebarVisible,
              'hover:text-black': !isSidebarVisible,
            })}
            onClick={handleToggleSidebar}
          >
            <Icon icon="cog" />
          </button>
          <div className="flex items-center gap-3 text-sm">
            {runtimeLog && <span>ToolRuntime 日志 · 本地处理</span>}
            {isLong && (
              <button
                type="button"
                className="font-bold underline"
                disabled={isLoading}
                onClick={() => setSubmittedSource({ source })}
              >
                {isLoading ? '处理中…' : '格式化长文本'}
              </button>
            )}
            {error && <span role="alert">{error}</span>}
            {previewTruncated && <span>仅显示前 32,000 个字符</span>}
            {previewTruncated && (
              <button type="button" className="font-bold underline" onClick={downloadResult}>
                下载完整结果
              </button>
            )}
          </div>
          {issueLink && (
            <div className="flex text-right">
              <Link
                href={issueLink}
                className="bg-transparent text-xs py-1 text-black font-bold no-underline hover:underline"
              >
                Report issue
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
