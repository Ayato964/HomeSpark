import React, { useState, useEffect, useRef } from 'react';
import { Person } from '../../types/chat';
import { ChatService } from '../../services/ChatService';

interface DigitalBusinessCardViewProps {
  token: string | null;
  initialPerson?: Person | null;
  onBackToPreviousView?: () => void;
  fromPreviousViewName?: string;
}

export const DigitalBusinessCardView: React.FC<DigitalBusinessCardViewProps> = ({
  token,
  initialPerson,
  onBackToPreviousView,
  fromPreviousViewName
}) => {
  const [viewState, setViewState] = useState<'list' | 'create' | 'edit' | 'detail' | 'ocr_modal'>(
    initialPerson ? 'detail' : 'list'
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(initialPerson || null);

  // Person related events state
  const [personEvents, setPersonEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false);

  useEffect(() => {
    if (initialPerson) {
      setSelectedPerson(initialPerson);
      setViewState('detail');
    }
  }, [initialPerson]);

  useEffect(() => {
    if (selectedPerson && viewState === 'detail') {
      setLoadingEvents(true);
      const service = new ChatService();
      service.getPersonRelatedEvents(token, selectedPerson.id)
        .then(res => setPersonEvents(res.events || []))
        .catch(err => console.error("Failed to load person events:", err))
        .finally(() => setLoadingEvents(false));
    }
  }, [selectedPerson?.id, viewState, token]);

  // "+" Plus Button Dropdown State
  const [plusMenuOpen, setPlusMenuOpen] = useState<boolean>(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  // Search and Sort State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortKey, setSortKey] = useState<'created_desc' | 'created_asc' | 'name_asc' | 'company_asc'>('created_desc');

  // Form State (used for create & edit)
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    role: '',
    email: '',
    phone: '',
    address: '',
    postal_code: '',
    hobbies: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState<boolean>(false);

  // OCR Camera & Upload State
  const [ocrImageBase64, setOcrImageBase64] = useState<string | null>(null);
  const [ocrMimeType, setOcrMimeType] = useState<string>('image/jpeg');
  const [ocrAnalyzing, setOcrAnalyzing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real-time Camera Stream State
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Close plus menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setPlusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clean up camera stream on unmount or view change
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      setMediaStream(stream);
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.error("Video play error:", e));
        }
      }, 100);
    } catch (err) {
      console.error("Camera access failed:", err);
      alert("カメラの起動に失敗しました。デバイスのカメラ権限を確認してください。");
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setOcrImageBase64(dataUrl);
      setOcrMimeType('image/jpeg');
      stopCamera();
    }
  };

  const fetchPeople = async () => {
    setLoading(true);
    try {
      const service = new ChatService();
      const res = await service.getPeopleList(token);
      setPeople(res.people || []);
    } catch (err) {
      console.error("Failed to fetch people list:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPeople();
  }, [token]);

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return '登録日時なし';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const pad = (n: number) => ('0' + n).slice(-2);
      return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return isoStr;
    }
  };

  const handleStartCreateManual = () => {
    stopCamera();
    setPlusMenuOpen(false);
    setFormData({
      name: '',
      company: '',
      role: '',
      email: '',
      phone: '',
      address: '',
      postal_code: '',
      hobbies: '',
      notes: ''
    });
    setViewState('create');
  };

  const handleStartOCRUpload = () => {
    setPlusMenuOpen(false);
    setOcrImageBase64(null);
    setCameraActive(false);
    setViewState('ocr_modal');
  };

  const handleStartEdit = (p: Person) => {
    stopCamera();
    setSelectedPerson(p);
    setFormData({
      name: p.name || '',
      company: p.company || '',
      role: p.role || '',
      email: p.email || '',
      phone: p.phone || '',
      address: p.address || '',
      postal_code: p.postal_code || '',
      hobbies: p.hobbies || '',
      notes: p.notes || ''
    });
    setViewState('edit');
  };

  // Image Selection Handler (File)
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrMimeType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setOcrImageBase64(result);
      stopCamera();
    };
    reader.readAsDataURL(file);
  };

  // Run Gemma Vision AI Analysis on Business Card Image
  const handleRunGemmaOCR = async () => {
    if (!ocrImageBase64) return;
    setOcrAnalyzing(true);
    try {
      const service = new ChatService();
      const res = await service.ocrBusinessCard(token, ocrImageBase64, ocrMimeType);

      if (res.data) {
        setFormData({
          name: res.data.name || '',
          company: res.data.company || '',
          role: res.data.role || '',
          email: res.data.email || '',
          phone: res.data.phone || '',
          address: res.data.address || '',
          postal_code: res.data.postal_code || '',
          hobbies: res.data.hobbies || '',
          notes: res.data.notes || ''
        });
        setViewState('create');
      } else {
        alert("名刺からの情報抽出ができませんでした。手入力してください。");
      }
    } catch (err) {
      console.error("Failed Gemma OCR analysis:", err);
      alert("名刺解析中にエラーが発生しました。");
    } finally {
      setOcrAnalyzing(false);
    }
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert("名前を入力してください。");
      return;
    }

    setSubmitting(true);
    try {
      const service = new ChatService();
      const res = await service.createPersonProfile(token, formData);
      await fetchPeople();
      if (res.person) {
        setSelectedPerson(res.person);
        setViewState('detail');
      } else {
        setViewState('list');
      }
    } catch (err) {
      console.error("Failed to save person profile:", err);
      alert("プロファイル保存中にエラーが発生しました。");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePerson = async (personId: string, name: string) => {
    if (!window.confirm(`「${name}」の名刺プロファイルを削除してもよろしいですか？`)) {
      return;
    }

    try {
      const service = new ChatService();
      await service.deletePersonProfile(token, personId);
      await fetchPeople();
      setSelectedPerson(null);
      setViewState('list');
    } catch (err) {
      console.error("Failed to delete person profile:", err);
      alert("削除中にエラーが発生しました。");
    }
  };

  // Filtered and Sorted People Calculation
  const filteredPeople = people.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.company && p.company.toLowerCase().includes(q)) ||
      (p.role && p.role.toLowerCase().includes(q)) ||
      (p.address && p.address.toLowerCase().includes(q)) ||
      (p.postal_code && p.postal_code.toLowerCase().includes(q))
    );
  });

  const sortedPeople = [...filteredPeople].sort((a, b) => {
    if (sortKey === 'name_asc') {
      return a.name.localeCompare(b.name, 'ja');
    }
    if (sortKey === 'company_asc') {
      return (a.company || '').localeCompare(b.company || '', 'ja');
    }
    if (sortKey === 'created_asc') {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime;
    }
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });

  // --- View: Gemma OCR Camera & Upload Modal ---
  if (viewState === 'ocr_modal') {
    return (
      <div style={{
        flex: 1,
        height: '100%',
        overflowY: 'auto',
        padding: '40px 48px',
        background: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        maxWidth: '850px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Hidden Canvas for Video Capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <div>
          <button
            onClick={() => {
              stopCamera();
              setViewState('list');
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: 'var(--panel)',
              border: '1px solid var(--border3)',
              borderRadius: '6px',
              color: 'var(--text2)',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontFamily: "'IBM Plex Mono', monospace"
            }}
          >
            ← 名刺一覧へ戻る
          </button>
        </div>

        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border2)',
          borderRadius: '16px',
          padding: '36px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{
              fontSize: '11.5px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              fontFamily: "'IBM Plex Mono', monospace"
            }}>
              GEMMA AI BUSINESS CARD SCANNER
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>
              名刺を撮影 / アップロード
            </h1>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text3)', margin: 0, lineHeight: 1.6 }}>
            カメラを起動して名刺を撮影するか、端末内の画像ファイルを選択してください。Gemma AI エージェントが名前、連絡先、郵便番号、会社住所などを自動解析します。
          </p>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageFileChange}
            style={{ display: 'none' }}
          />

          {/* Section 1: Real-time Camera Viewfinder */}
          {cameraActive ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: '560px',
                height: '340px',
                background: '#000',
                borderRadius: '14px',
                overflow: 'hidden',
                border: '2px solid var(--accent)',
                boxShadow: '0 8px 30px rgba(0,0,0,0.2)'
              }}>
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '80%',
                  height: '65%',
                  border: '2px dashed rgba(255, 255, 255, 0.8)',
                  borderRadius: '10px',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: '12px',
                  fontWeight: 600
                }}>
                  名刺をこの枠内に合わせてください
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={capturePhoto}
                  style={{
                    padding: '12px 32px',
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    border: 'none',
                    borderRadius: '30px',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(45, 212, 191, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span style={{ fontSize: '18px' }}>📸</span>
                  <span>パシャリ (撮影する)</span>
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  style={{
                    padding: '10px 18px',
                    background: 'transparent',
                    border: '1px solid var(--border3)',
                    borderRadius: '20px',
                    color: 'var(--text2)',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  カメラを閉じる
                </button>
              </div>
            </div>
          ) : (
            /* Section 2: Upload or Start Camera Trigger Cards */
            !ocrImageBase64 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                <div
                  onClick={startCamera}
                  style={{
                    padding: '36px 24px',
                    background: 'var(--bg)',
                    border: '2px solid var(--accent)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(45, 212, 191, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ fontSize: '36px' }}>📷</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
                    カメラを起動して撮影
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>
                    ファインダーで名刺をパシャリ
                  </div>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '36px 24px',
                    background: 'var(--bg)',
                    border: '1px dashed var(--border3)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border3)';
                  }}
                >
                  <div style={{ fontSize: '36px' }}>📁</div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
                    画像ファイルを選択
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    保存済みの写真・画像ファイルをアップロード
                  </div>
                </div>
              </div>
            ) : (
              /* Section 3: Preview captured image and trigger Gemma AI OCR */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                <div style={{
                  maxWidth: '420px',
                  maxHeight: '260px',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1px solid var(--border3)',
                  boxShadow: '0 4px 18px rgba(0,0,0,0.1)'
                }}>
                  <img
                    src={ocrImageBase64}
                    alt="撮影・選択された名刺"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setOcrImageBase64(null);
                      startCamera();
                    }}
                    disabled={ocrAnalyzing}
                    style={{
                      padding: '9px 18px',
                      background: 'transparent',
                      border: '1px solid var(--border3)',
                      borderRadius: '6px',
                      color: 'var(--text2)',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    再撮影する
                  </button>
                  <button
                    type="button"
                    onClick={handleRunGemmaOCR}
                    disabled={ocrAnalyzing}
                    style={{
                      padding: '9px 24px',
                      background: 'var(--accent)',
                      color: 'var(--on-accent)',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: ocrAnalyzing ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 14px rgba(45, 212, 191, 0.25)'
                    }}
                  >
                    {ocrAnalyzing ? 'Gemmaが名刺を分析中...' : '✨ Gemma AIで名刺を解析する'}
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    );
  }

  // --- View 2: Create or Edit Form ---
  if (viewState === 'create' || viewState === 'edit') {
    const isEdit = viewState === 'edit';

    return (
      <div style={{
        flex: 1,
        height: '100%',
        overflowY: 'auto',
        padding: '40px 48px',
        background: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        maxWidth: '850px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <div>
          <button
            onClick={() => isEdit && selectedPerson ? setViewState('detail') : setViewState('list')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: 'var(--panel)',
              border: '1px solid var(--border3)',
              borderRadius: '6px',
              color: 'var(--text2)',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontFamily: "'IBM Plex Mono', monospace"
            }}
          >
            ← {isEdit ? '詳細画面へ戻る' : '名刺一覧へ戻る'}
          </button>
        </div>

        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border2)',
          borderRadius: '16px',
          padding: '32px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{
              fontSize: '11.5px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              fontFamily: "'IBM Plex Mono', monospace"
            }}>
              {isEdit ? 'EDIT PROFILE' : 'PROFILING REGISTRATION'}
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>
              {isEdit ? `「${selectedPerson?.name}」のプロファイル編集` : 'プロファイル（名刺）新規登録'}
            </h1>
          </div>

          <form onSubmit={handleSaveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text2)' }}>
                  名前 <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: 山田 太郎"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border3)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text2)' }}>会社名</label>
                <input
                  type="text"
                  placeholder="例: 株式会社サンプル"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border3)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text2)' }}>役職</label>
                <input
                  type="text"
                  placeholder="例: 営業部長 / 課長"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border3)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text2)' }}>メールアドレス</label>
                <input
                  type="email"
                  placeholder="例: yamada@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border3)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text2)' }}>電話番号</label>
                <input
                  type="tel"
                  placeholder="例: 090-1234-5678"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border3)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text2)' }}>郵便番号</label>
                <input
                  type="text"
                  placeholder="例: 100-0005"
                  value={formData.postal_code}
                  onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border3)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text2)' }}>会社住所</label>
                <input
                  type="text"
                  placeholder="例: 東京都千代田区大手町1-1-1"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border3)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text2)' }}>趣味</label>
                <input
                  type="text"
                  placeholder="例: ゴルフ, 読書, サウナ"
                  value={formData.hobbies}
                  onChange={(e) => setFormData({ ...formData, hobbies: e.target.value })}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border3)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text2)' }}>営業メモ (特徴・キーフレーズ)</label>
              <textarea
                rows={4}
                placeholder="例: 決裁権あり。次回提案時は予算重視。ワインが好き。"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                style={{
                  padding: '12px 14px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border3)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: '13.5px',
                  outline: 'none',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => isEdit && selectedPerson ? setViewState('detail') : setViewState('list')}
                style={{
                  padding: '9px 18px',
                  background: 'transparent',
                  border: '1px solid var(--border3)',
                  borderRadius: '6px',
                  color: 'var(--text2)',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '9px 24px',
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: submitting ? 'not-allowed' : 'pointer'
                }}
              >
                {submitting ? '保存中...' : (isEdit ? '更新を保存する' : '登録する')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --- View 3: Person Detail View ---
  if (viewState === 'detail' && selectedPerson) {
    return (
      <div style={{
        flex: 1,
        height: '100%',
        overflowY: 'auto',
        padding: '40px 48px',
        background: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        maxWidth: '850px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Navigation & Action Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {onBackToPreviousView ? (
              <button
                onClick={onBackToPreviousView}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '12.5px',
                  boxShadow: '0 4px 14px rgba(45, 212, 191, 0.25)'
                }}
              >
                ← {fromPreviousViewName || '元の画面'}へ戻る
              </button>
            ) : null}
            <button
              onClick={() => setViewState('list')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                background: 'var(--panel)',
                border: '1px solid var(--border3)',
                borderRadius: '6px',
                color: 'var(--text2)',
                cursor: 'pointer',
                fontSize: '12.5px',
                fontFamily: "'IBM Plex Mono', monospace"
              }}
            >
              ← 名刺一覧へ戻る
            </button>
          </div>

          {/* Edit & Delete Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => handleStartEdit(selectedPerson)}
              style={{
                padding: '8px 16px',
                background: 'var(--panel)',
                border: '1px solid var(--accent)',
                borderRadius: '6px',
                color: 'var(--accent)',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              編集する
            </button>
            <button
              onClick={() => handleDeletePerson(selectedPerson.id, selectedPerson.name)}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '6px',
                color: '#EF4444',
                fontSize: '12.5px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              削除
            </button>
          </div>
        </div>

        {/* Business Card Profile Container */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border2)',
          borderLeft: '6px solid var(--accent)',
          borderRadius: '16px',
          padding: '36px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: '28px',
          boxShadow: '0 6px 30px rgba(0,0,0,0.04)'
        }}>
          {/* Header Profile Info */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
                fontFamily: "'IBM Plex Mono', monospace"
              }}>
                PERSON PROFILE
              </div>
              <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {selectedPerson.name}
              </h1>
              <div style={{
                fontSize: '14.5px',
                color: (selectedPerson.company || selectedPerson.role) ? 'var(--text2)' : 'var(--muted)',
                fontWeight: 500,
                marginTop: '2px'
              }}>
                {(selectedPerson.company || selectedPerson.role)
                  ? `${selectedPerson.company || ''}${selectedPerson.company && selectedPerson.role ? ' / ' : ''}${selectedPerson.role || ''}`
                  : '会社名・役職: 登録されていません'}
              </div>
            </div>

            {/* Created At Timestamp Badge */}
            <div style={{
              fontSize: '11.5px',
              fontFamily: "'IBM Plex Mono', monospace",
              color: 'var(--text3)',
              background: 'var(--bg)',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)'
            }}>
              登録日時: {formatDate(selectedPerson.created_at)}
            </div>
          </div>

          {/* Details Table Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text3)', width: '100px', fontWeight: 500, flex: 'none' }}>メール</span>
              <span style={{
                fontSize: '14px',
                fontFamily: selectedPerson.email ? "'IBM Plex Mono', monospace" : 'inherit',
                color: selectedPerson.email ? 'var(--text)' : 'var(--muted)'
              }}>
                {selectedPerson.email || '登録されていません'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text3)', width: '100px', fontWeight: 500, flex: 'none' }}>電話番号</span>
              <span style={{
                fontSize: '14px',
                fontFamily: selectedPerson.phone ? "'IBM Plex Mono', monospace" : 'inherit',
                color: selectedPerson.phone ? 'var(--text)' : 'var(--muted)'
              }}>
                {selectedPerson.phone || '登録されていません'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text3)', width: '100px', fontWeight: 500, flex: 'none' }}>郵便番号</span>
              <span style={{
                fontSize: '14px',
                fontFamily: selectedPerson.postal_code ? "'IBM Plex Mono', monospace" : 'inherit',
                color: selectedPerson.postal_code ? 'var(--text)' : 'var(--muted)'
              }}>
                {selectedPerson.postal_code || '登録されていません'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text3)', width: '100px', fontWeight: 500, flex: 'none' }}>会社住所</span>
              <span style={{
                fontSize: '14px',
                color: selectedPerson.address ? 'var(--text)' : 'var(--muted)'
              }}>
                {selectedPerson.address || '登録されていません'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text3)', width: '100px', fontWeight: 500, flex: 'none' }}>趣味</span>
              <span style={{
                fontSize: '14px',
                color: selectedPerson.hobbies ? 'var(--text)' : 'var(--muted)'
              }}>
                {selectedPerson.hobbies || '登録されていません'}
              </span>
            </div>
          </div>

          {/* Sales Notes Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>営業メモ</div>
            <div style={{
              fontSize: '13.5px',
              color: selectedPerson.notes ? 'var(--text)' : 'var(--muted)',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              background: 'var(--bg)',
              padding: '20px',
              borderRadius: '10px',
              border: '1px solid var(--border2)'
            }}>
              {selectedPerson.notes || '登録されていません'}
            </div>
          </div>

          {/* Participated Events Section (New Feature!) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
                fontFamily: "'IBM Plex Mono', monospace"
              }}>
                PARTICIPATED EVENTS
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                関わったイベント・商談 ({personEvents.length}件)
              </div>
            </div>

            {loadingEvents ? (
              <div style={{ fontSize: '12.5px', color: 'var(--muted)', padding: '12px 0' }}>
                関わったイベントを読み込み中...
              </div>
            ) : (
              personEvents.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {personEvents.map((ev, idx) => (
                    <div
                      key={ev.id || idx}
                      style={{
                        padding: '14px 18px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border2)',
                        borderLeft: '4px solid var(--accent)',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text)' }}>
                        📅 {ev.summary || '(無題)'}
                      </div>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text2)' }}>
                        <span>🕒 {ev.start || '時間未設定'}</span>
                        {ev.location && <span>📍 {ev.location}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '16px 20px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border2)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: 'var(--muted)'
                }}>
                  現在紐付いているカレンダーのイベント・商談はありません。
                </div>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- View 4: Person Card List with "+" Dropdown Menu ---
  return (
    <div style={{
      flex: 1,
      height: '100%',
      overflowY: 'auto',
      padding: '40px 48px',
      background: 'var(--bg)',
      color: 'var(--text)',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      maxWidth: '900px',
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Page Header with Dropdown "+" Button */}
      <div style={{
        borderBottom: '2px solid var(--border2)',
        paddingBottom: '20px',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        position: 'relative'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>
            DIGITAL BUSINESS CARDS
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            デジタル名刺
          </h1>
        </div>

        {/* Dropdown Container for "+" Button */}
        <div ref={plusMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setPlusMenuOpen(prev => !prev)}
            title="名刺・プロファイル登録"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              border: 'none',
              fontSize: '22px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(45, 212, 191, 0.25)',
              transition: 'transform 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            ＋
          </button>

          {/* Plus Menu Popup */}
          {plusMenuOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '48px',
              width: '220px',
              background: 'var(--panel)',
              border: '1px solid var(--border2)',
              borderRadius: '12px',
              padding: '6px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <button
                onClick={handleStartCreateManual}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--activebg)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ fontSize: '15px' }}>✏️</span>
                <span>自分で入力</span>
              </button>

              <button
                onClick={handleStartOCRUpload}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--activebg)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ fontSize: '15px' }}>📷</span>
                <span>名刺をアップロード (カメラ)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search Bar & Category Sort Dropdown */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
          <input
            type="text"
            placeholder="名前、会社名、役職、住所、郵便番号で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'var(--panel)',
              border: '1px solid var(--border2)',
              borderRadius: '8px',
              color: 'var(--text)',
              fontSize: '13.5px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as any)}
          style={{
            padding: '10px 14px',
            background: 'var(--panel)',
            border: '1px solid var(--border2)',
            borderRadius: '8px',
            color: 'var(--text2)',
            fontSize: '13px',
            fontFamily: "'IBM Plex Mono', monospace",
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="created_desc">登録日時: 新しい順</option>
          <option value="created_asc">登録日時: 古い順</option>
          <option value="name_asc">名前順 (昇順)</option>
          <option value="company_asc">会社名順 (昇順)</option>
        </select>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{
          padding: '32px 0',
          fontSize: '13px',
          color: 'var(--muted)',
          fontFamily: "'IBM Plex Mono', monospace"
        }}>
          名刺データを読み込んでいます...
        </div>
      )}

      {/* People Card List */}
      {!loading && (
        sortedPeople.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
            gap: '16px'
          }}>
            {sortedPeople.map(p => (
              <div
                key={p.id}
                onClick={() => {
                  stopCamera();
                  setSelectedPerson(p);
                  setViewState('detail');
                }}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--border2)',
                  borderRadius: '12px',
                  padding: '20px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'var(--border2)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.03)';
                }}
              >
                <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)' }}>
                  {p.name}
                </div>
                {(p.company || p.role) ? (
                  <div style={{ fontSize: '12.5px', color: 'var(--text2)', fontWeight: 500 }}>
                    {p.company} {p.role ? `(${p.role})` : ''}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    会社名未登録
                  </div>
                )}
                {p.email && (
                  <div style={{ fontSize: '11.5px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)', marginTop: '2px' }}>
                    {p.email}
                  </div>
                )}
                <div style={{ fontSize: '10.5px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--faint)', marginTop: '6px' }}>
                  登録: {formatDate(p.created_at)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Empty State */
          <div style={{
            background: 'var(--panel)',
            border: '1px solid var(--border2)',
            borderRadius: '16px',
            padding: '48px 32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
            textAlign: 'center',
            gap: '16px'
          }}>
            <div style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text3)'
            }}>
              {searchQuery ? '検索条件に一致する名刺はありません' : '名刺が登録されていません'}
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--muted)', margin: 0 }}>
              {searchQuery ? 'キーワードを変更して再度検索してください。' : '右上にある「＋」ボタンを押して、営業相手や顧客のプロファイルを登録してください。'}
            </p>
          </div>
        )
      )}
    </div>
  );
};
