// admin-frontend/src/pages/ChallengeManagePage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { FiPlus, FiEdit, FiTrash, FiPower, FiX } from 'react-icons/fi';

interface Challenge {
  challengeId: string;
  title: string;
  description: string;
  category: string;
  targetTime: string;
  badgeIcon: string;
  badgeName: string;
  identityKeyword?: string;
  allowedVerificationTypes?: Array<'image' | 'text' | 'link' | 'video'>;
  isActive: boolean;
  stats?: {
    totalParticipants: number;
  };
}

export const ChallengeManagePage = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null);

  // 챌린지 목록 조회
  const { data: challenges, isLoading } = useQuery({
    queryKey: ['admin-challenges'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges?limit=100');
      return response.data.data.challenges as Challenge[];
    },
  });

  // 챌린지 삭제
  const deleteMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      await apiClient.delete(`/admin/challenges/${challengeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-challenges'] });
      alert('챌린지가 삭제되었습니다');
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '삭제에 실패했습니다');
    },
  });

  // 챌린지 활성화/비활성화
  const toggleMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      await apiClient.post(`/admin/challenges/${challengeId}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-challenges'] });
    },
  });

  const handleDelete = (challenge: Challenge) => {
    if (challenge.stats && challenge.stats.totalParticipants > 0) {
      alert('참여자가 있는 챌린지는 삭제할 수 없습니다. 비활성화를 사용하세요.');
      return;
    }

    if (confirm(`"${challenge.title}" 챌린지를 삭제하시겠습니까?`)) {
      deleteMutation.mutate(challenge.challengeId);
    }
  };

  const handleToggle = (challenge: Challenge) => {
    if (confirm(`챌린지를 ${challenge.isActive ? '비활성화' : '활성화'} 하시겠습니까?`)) {
      toggleMutation.mutate(challenge.challengeId);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">챌린지 관리</h1>
        <button
          onClick={() => {
            setEditingChallenge(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <FiPlus />
          새 챌린지
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">로딩 중...</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">아이콘</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">제목</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">카테고리</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">목표시간</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">참여자</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">상태</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {challenges?.map((challenge) => (
                <tr key={challenge.challengeId} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="text-3xl">{challenge.badgeIcon}</span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-gray-900">{challenge.title}</p>
                    <p className="text-sm text-gray-500 truncate max-w-xs">{challenge.description}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                      {challenge.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{challenge.targetTime}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {challenge.stats?.totalParticipants || 0}명
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                      challenge.isActive 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {challenge.isActive ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingChallenge(challenge);
                          setShowModal(true);
                        }}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                        title="수정"
                      >
                        <FiEdit />
                      </button>
                      <button
                        onClick={() => handleToggle(challenge)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                        title={challenge.isActive ? '비활성화' : '활성화'}
                      >
                        <FiPower />
                      </button>
                      <button
                        onClick={() => handleDelete(challenge)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        title="삭제"
                        disabled={challenge.stats && challenge.stats.totalParticipants > 0}
                      >
                        <FiTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {challenges?.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              챌린지가 없습니다
            </div>
          )}
        </div>
      )}

      {showModal && (
        <ChallengeModal
          challenge={editingChallenge}
          onClose={() => {
            setShowModal(false);
            setEditingChallenge(null);
          }}
        />
      )}
    </div>
  );
};

// 챌린지 생성/수정 모달
const ChallengeModal = ({ challenge, onClose }: { challenge: Challenge | null; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    title: challenge?.title || '',
    description: challenge?.description || '',
    category: challenge?.category || 'health',
    targetTime: challenge?.targetTime || '07:00',
    identityKeyword: challenge?.identityKeyword || '',
    badgeIcon: challenge?.badgeIcon || '🏃',
    badgeName: challenge?.badgeName || '',
    allowedVerificationTypes: challenge?.allowedVerificationTypes?.length ? challenge.allowedVerificationTypes : ['image', 'text', 'link', 'video'],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (challenge) {
        // 수정
        await apiClient.put(`/admin/challenges/${challenge.challengeId}`, data);
      } else {
        // 생성
        await apiClient.post('/admin/challenges', data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-challenges'] });
      alert(challenge ? '챌린지가 수정되었습니다' : '챌린지가 생성되었습니다');
      onClose();
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '저장에 실패했습니다');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };


  const toggleAllowedType = (type: 'image' | 'text' | 'link' | 'video') => {
    setFormData((prev) => {
      const current = prev.allowedVerificationTypes || [];
      const exists = current.includes(type);
      const next = exists ? current.filter((item) => item !== type) : [...current, type];

      if (next.length === 0) {
        alert('최소 1개 이상의 인증유형을 선택해주세요.');
        return prev;
      }

      return { ...prev, allowedVerificationTypes: next };
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            {challenge ? '챌린지 수정' : '새 챌린지'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              제목 *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              설명 *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              rows={3}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                카테고리 *
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="health">건강</option>
                <option value="habit">습관</option>
                <option value="development">자기계발</option>
                <option value="creativity">창의성</option>
                <option value="relationship">관계</option>
                <option value="mindfulness">마음챙김</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                목표 시간 *
              </label>
              <input
                type="time"
                value={formData.targetTime}
                onChange={(e) => setFormData({ ...formData, targetTime: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                뱃지 아이콘 *
              </label>
              <input
                type="text"
                value={formData.badgeIcon}
                onChange={(e) => setFormData({ ...formData, badgeIcon: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="🏃"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                뱃지 이름 *
              </label>
              <input
                type="text"
                value={formData.badgeName}
                onChange={(e) => setFormData({ ...formData, badgeName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Runner"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              정체성 키워드 *
            </label>
            <input
              type="text"
              value={formData.identityKeyword}
              onChange={(e) => setFormData({ ...formData, identityKeyword: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="새벽을 여는"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              "나는 [키워드] 사람"으로 표시됩니다
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              허용 인증유형 *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['image', 'text', 'link', 'video'] as const).map((type) => (
                <label key={type} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg">
                  <input
                    type="checkbox"
                    checked={(formData.allowedVerificationTypes || []).includes(type)}
                    onChange={() => toggleAllowedType(type)}
                  />
                  <span className="text-sm text-gray-700">
                    {type === 'image' && '사진'}
                    {type === 'text' && '텍스트'}
                    {type === 'link' && '링크'}
                    {type === 'video' && '영상 (60초 이하)'}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">기본값은 전체 허용이며 최소 1개 이상 선택해야 합니다.</p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {saveMutation.isPending ? '저장 중...' : (challenge ? '수정' : '생성')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// admin-frontend/src/pages/UserManagePage.tsx
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { FiMail, FiCalendar } from 'react-icons/fi';
import { format } from 'date-fns';

export const UserManagePage = () => {
  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const response = await apiClient.get('/admin/users?limit=100');
      return response.data.data;
    },
  });

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">사용자 관리</h1>

      {isLoading ? (
        <div className="text-center py-12">로딩 중...</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">아이콘</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">이름</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">이메일</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">레벨</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">응원권</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">가입일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usersData?.users?.map((user: any) => (
                <tr key={user.userId} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="text-2xl">{user.animalIcon || '🐰'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-gray-900">{user.name}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <FiMail className="w-4 h-4" />
                      {user.email}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                      Lv.{user.level}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {user.cheerTickets}장
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <FiCalendar className="w-4 h-4" />
                      {format(new Date(user.createdAt), 'yyyy.MM.dd')}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {usersData?.users?.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              사용자가 없습니다
            </div>
          )}
        </div>
      )}
    </div>
  );
};
