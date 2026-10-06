import {
  requiredSidesFor,
  type DocumentSide,
  type KycDocument,
  type KycView,
} from "./types";

/**
 * Shared reading of `GET /api/kyc`, used by the wallet banner and /verify.
 *
 * `POST /api/kyc/documents` attaches to the caller's newest SUBMITTED submission,
 * so that is the only one a customer can still fix. It is picked by `recordId`
 * rather than by position, because the contract promises no array order.
 */
export function openSubmission(view: KycView | null): KycDocument | null {
  const submitted = (view?.documents ?? []).filter((document) => document.status === "SUBMITTED");
  if (submitted.length === 0) return null;
  return submitted.reduce((newest, candidate) =>
    candidate.recordId > newest.recordId ? candidate : newest,
  );
}

/** The sides this document type needs that have no stored image yet. */
export function missingSidesFor(document: KycDocument | null): DocumentSide[] {
  if (!document) return [];
  return requiredSidesFor(document.documentType).filter((side) => {
    const stored = document.sides?.[side];
    return stored === null || stored === undefined;
  });
}
