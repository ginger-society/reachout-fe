import { useCallback, useState } from "react";
import { AuthHeartBeat, Modal, ModalBody, ModalHeader } from "@ginger-society/ginger-ui";
import { IAMService } from "@/services";

/**
 * Network / offline failures are not auth failures: don't show the modal for those,
 * AuthHeartBeat retries on its next interval.
 */
const isAuthError = (err: unknown): boolean => {
  if (err instanceof TypeError) return false; // e.g. "Failed to fetch"
  const status = (err as any)?.response?.status ?? (err as any)?.status;
  return status === 401 || status === 403;
};

/**
 * Keeps the access token fresh and asks the agent to sign in again when the session can't be renewed.
 *
 * Render this somewhere that does NOT re-render on a timer (the dashboard ticks every second), and keep
 * `refreshTokenFn` referentially stable: otherwise AuthHeartBeat's interval keeps getting reset.
 */
const SessionGuard = () => {
  const [isReauthModalOpen, setIsReauthModalOpen] = useState(false);

  const refreshTokenFn = useCallback(async (refreshToken: string) => {
    try {
      const tokens = await IAMService.identityRefreshToken({
        refreshTokenRequest: { refreshToken },
      });
      return tokens.accessToken;
    } catch (err) {
      if (isAuthError(err)) setIsReauthModalOpen(true);
      throw err;
    }
  }, []);

  const handleReauth = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <>
      <AuthHeartBeat refreshTokenFn={refreshTokenFn} />
      <Modal
        isOpen={isReauthModalOpen}
        onClose={handleReauth}
        preventCancelOnOverlay
        footerConfig={{}}
        onOk={handleReauth}
      >
        <ModalHeader>Session Expired</ModalHeader>
        <ModalBody>
          <p>Re authenticate to continue</p>
        </ModalBody>
      </Modal>
    </>
  );
};

export default SessionGuard;