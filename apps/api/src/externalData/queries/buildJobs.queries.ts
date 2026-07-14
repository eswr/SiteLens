/** Types generated for queries found in "src/externalData/queries/buildJobs.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** 'GetBuildJobById' parameters type */
export interface IGetBuildJobByIdParams {
  jobId: string;
}

/** 'GetBuildJobById' return type */
export interface IGetBuildJobByIdResult {
  attempts: number;
  counts: Json | null;
  created_at: Date;
  error_message: string | null;
  finished_at: Date | null;
  id: string;
  locked_until: Date | null;
  place: Json;
  planning_context_id: string;
  reused: boolean | null;
  started_at: Date | null;
  status: string;
  updated_at: Date;
  user_id: string | null;
}

/** 'GetBuildJobById' query type */
export interface IGetBuildJobByIdQuery {
  params: IGetBuildJobByIdParams;
  result: IGetBuildJobByIdResult;
}

const getBuildJobByIdIR: any = {"usedParamSet":{"jobId":true},"params":[{"name":"jobId","required":true,"transform":{"type":"scalar"},"locs":[{"a":297,"b":303}]}],"statement":"SELECT id,\n       planning_context_id,\n       status,\n       place,\n       counts,\n       reused,\n       error_message,\n       user_id,\n       attempts,\n       locked_until,\n       created_at,\n       updated_at,\n       started_at,\n       finished_at\n  FROM planning_context_build_jobs\n WHERE id = :jobId!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id,
 *        planning_context_id,
 *        status,
 *        place,
 *        counts,
 *        reused,
 *        error_message,
 *        user_id,
 *        attempts,
 *        locked_until,
 *        created_at,
 *        updated_at,
 *        started_at,
 *        finished_at
 *   FROM planning_context_build_jobs
 *  WHERE id = :jobId!
 * ```
 */
export const getBuildJobById = new PreparedQuery<IGetBuildJobByIdParams,IGetBuildJobByIdResult>(getBuildJobByIdIR);


/** 'FindActiveBuildJobByContext' parameters type */
export interface IFindActiveBuildJobByContextParams {
  planningContextId: string;
}

/** 'FindActiveBuildJobByContext' return type */
export interface IFindActiveBuildJobByContextResult {
  attempts: number;
  counts: Json | null;
  created_at: Date;
  error_message: string | null;
  finished_at: Date | null;
  id: string;
  locked_until: Date | null;
  place: Json;
  planning_context_id: string;
  reused: boolean | null;
  started_at: Date | null;
  status: string;
  updated_at: Date;
  user_id: string | null;
}

/** 'FindActiveBuildJobByContext' query type */
export interface IFindActiveBuildJobByContextQuery {
  params: IFindActiveBuildJobByContextParams;
  result: IFindActiveBuildJobByContextResult;
}

const findActiveBuildJobByContextIR: any = {"usedParamSet":{"planningContextId":true},"params":[{"name":"planningContextId","required":true,"transform":{"type":"scalar"},"locs":[{"a":314,"b":332}]}],"statement":"SELECT id,\n       planning_context_id,\n       status,\n       place,\n       counts,\n       reused,\n       error_message,\n       user_id,\n       attempts,\n       locked_until,\n       created_at,\n       updated_at,\n       started_at,\n       finished_at\n  FROM planning_context_build_jobs\n WHERE planning_context_id = :planningContextId!\n   AND status IN ('queued', 'running')\n ORDER BY created_at DESC\n LIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id,
 *        planning_context_id,
 *        status,
 *        place,
 *        counts,
 *        reused,
 *        error_message,
 *        user_id,
 *        attempts,
 *        locked_until,
 *        created_at,
 *        updated_at,
 *        started_at,
 *        finished_at
 *   FROM planning_context_build_jobs
 *  WHERE planning_context_id = :planningContextId!
 *    AND status IN ('queued', 'running')
 *  ORDER BY created_at DESC
 *  LIMIT 1
 * ```
 */
export const findActiveBuildJobByContext = new PreparedQuery<IFindActiveBuildJobByContextParams,IFindActiveBuildJobByContextResult>(findActiveBuildJobByContextIR);


/** 'InsertBuildJob' parameters type */
export interface IInsertBuildJobParams {
  counts?: Json | null | void;
  createdAt: DateOrString;
  errorMessage?: string | null | void;
  finishedAt?: DateOrString | null | void;
  place: Json;
  planningContextId: string;
  reused?: boolean | null | void;
  startedAt?: DateOrString | null | void;
  status: string;
  updatedAt: DateOrString;
  userId?: string | null | void;
}

/** 'InsertBuildJob' return type */
export interface IInsertBuildJobResult {
  attempts: number;
  counts: Json | null;
  created_at: Date;
  error_message: string | null;
  finished_at: Date | null;
  id: string;
  locked_until: Date | null;
  place: Json;
  planning_context_id: string;
  reused: boolean | null;
  started_at: Date | null;
  status: string;
  updated_at: Date;
  user_id: string | null;
}

/** 'InsertBuildJob' query type */
export interface IInsertBuildJobQuery {
  params: IInsertBuildJobParams;
  result: IInsertBuildJobResult;
}

const insertBuildJobIR: any = {"usedParamSet":{"planningContextId":true,"status":true,"place":true,"counts":true,"reused":true,"errorMessage":true,"userId":true,"createdAt":true,"updatedAt":true,"startedAt":true,"finishedAt":true},"params":[{"name":"planningContextId","required":true,"transform":{"type":"scalar"},"locs":[{"a":201,"b":219}]},{"name":"status","required":true,"transform":{"type":"scalar"},"locs":[{"a":224,"b":231}]},{"name":"place","required":true,"transform":{"type":"scalar"},"locs":[{"a":236,"b":242}]},{"name":"counts","required":false,"transform":{"type":"scalar"},"locs":[{"a":254,"b":260}]},{"name":"reused","required":false,"transform":{"type":"scalar"},"locs":[{"a":272,"b":278}]},{"name":"errorMessage","required":false,"transform":{"type":"scalar"},"locs":[{"a":283,"b":295}]},{"name":"userId","required":false,"transform":{"type":"scalar"},"locs":[{"a":300,"b":306}]},{"name":"createdAt","required":true,"transform":{"type":"scalar"},"locs":[{"a":311,"b":321}]},{"name":"updatedAt","required":true,"transform":{"type":"scalar"},"locs":[{"a":339,"b":349}]},{"name":"startedAt","required":false,"transform":{"type":"scalar"},"locs":[{"a":367,"b":376}]},{"name":"finishedAt","required":false,"transform":{"type":"scalar"},"locs":[{"a":394,"b":404}]}],"statement":"INSERT INTO planning_context_build_jobs (\n  planning_context_id,\n  status,\n  place,\n  counts,\n  reused,\n  error_message,\n  user_id,\n  created_at,\n  updated_at,\n  started_at,\n  finished_at\n) VALUES (\n  :planningContextId!,\n  :status!,\n  :place!::jsonb,\n  :counts::jsonb,\n  :reused,\n  :errorMessage,\n  :userId,\n  :createdAt!::timestamptz,\n  :updatedAt!::timestamptz,\n  :startedAt::timestamptz,\n  :finishedAt::timestamptz\n)\nRETURNING id,\n          planning_context_id,\n          status,\n          place,\n          counts,\n          reused,\n          error_message,\n          user_id,\n          attempts,\n          locked_until,\n          created_at,\n          updated_at,\n          started_at,\n          finished_at"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO planning_context_build_jobs (
 *   planning_context_id,
 *   status,
 *   place,
 *   counts,
 *   reused,
 *   error_message,
 *   user_id,
 *   created_at,
 *   updated_at,
 *   started_at,
 *   finished_at
 * ) VALUES (
 *   :planningContextId!,
 *   :status!,
 *   :place!::jsonb,
 *   :counts::jsonb,
 *   :reused,
 *   :errorMessage,
 *   :userId,
 *   :createdAt!::timestamptz,
 *   :updatedAt!::timestamptz,
 *   :startedAt::timestamptz,
 *   :finishedAt::timestamptz
 * )
 * RETURNING id,
 *           planning_context_id,
 *           status,
 *           place,
 *           counts,
 *           reused,
 *           error_message,
 *           user_id,
 *           attempts,
 *           locked_until,
 *           created_at,
 *           updated_at,
 *           started_at,
 *           finished_at
 * ```
 */
export const insertBuildJob = new PreparedQuery<IInsertBuildJobParams,IInsertBuildJobResult>(insertBuildJobIR);


/** 'ExtendBuildJobLease' parameters type */
export interface IExtendBuildJobLeaseParams {
  jobId: string;
  lockMs: number;
}

/** 'ExtendBuildJobLease' return type */
export interface IExtendBuildJobLeaseResult {
  id: string;
}

/** 'ExtendBuildJobLease' query type */
export interface IExtendBuildJobLeaseQuery {
  params: IExtendBuildJobLeaseParams;
  result: IExtendBuildJobLeaseResult;
}

const extendBuildJobLeaseIR: any = {"usedParamSet":{"lockMs":true,"jobId":true},"params":[{"name":"lockMs","required":true,"transform":{"type":"scalar"},"locs":[{"a":66,"b":73}]},{"name":"jobId","required":true,"transform":{"type":"scalar"},"locs":[{"a":160,"b":166}]}],"statement":"UPDATE planning_context_build_jobs\n   SET locked_until = now() + (:lockMs!::double precision * interval '1 millisecond'),\n       updated_at = now()\n WHERE id = :jobId!\n   AND status = 'running'\nRETURNING id"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE planning_context_build_jobs
 *    SET locked_until = now() + (:lockMs!::double precision * interval '1 millisecond'),
 *        updated_at = now()
 *  WHERE id = :jobId!
 *    AND status = 'running'
 * RETURNING id
 * ```
 */
export const extendBuildJobLease = new PreparedQuery<IExtendBuildJobLeaseParams,IExtendBuildJobLeaseResult>(extendBuildJobLeaseIR);


/** 'GetBuildJobQueueHealth' parameters type */
export type IGetBuildJobQueueHealthParams = void;

/** 'GetBuildJobQueueHealth' return type */
export interface IGetBuildJobQueueHealthResult {
  failed_recent: number | null;
  oldest_queued_at: Date | null;
  oldest_running_at: Date | null;
  queued: number | null;
  running: number | null;
  running_expired_lease: number | null;
  succeeded_recent: number | null;
}

/** 'GetBuildJobQueueHealth' query type */
export interface IGetBuildJobQueueHealthQuery {
  params: IGetBuildJobQueueHealthParams;
  result: IGetBuildJobQueueHealthResult;
}

const getBuildJobQueueHealthIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT\n  COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,\n  COUNT(*) FILTER (WHERE status = 'running')::int AS running,\n  COUNT(*) FILTER (\n    WHERE status = 'running'\n      AND (locked_until IS NULL OR locked_until < now())\n  )::int AS running_expired_lease,\n  COUNT(*) FILTER (\n    WHERE status = 'succeeded'\n      AND finished_at >= now() - interval '24 hours'\n  )::int AS succeeded_recent,\n  COUNT(*) FILTER (\n    WHERE status = 'failed'\n      AND finished_at >= now() - interval '24 hours'\n  )::int AS failed_recent,\n  MIN(created_at) FILTER (WHERE status = 'queued') AS oldest_queued_at,\n  MIN(started_at) FILTER (WHERE status = 'running') AS oldest_running_at\nFROM planning_context_build_jobs"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
 *   COUNT(*) FILTER (WHERE status = 'running')::int AS running,
 *   COUNT(*) FILTER (
 *     WHERE status = 'running'
 *       AND (locked_until IS NULL OR locked_until < now())
 *   )::int AS running_expired_lease,
 *   COUNT(*) FILTER (
 *     WHERE status = 'succeeded'
 *       AND finished_at >= now() - interval '24 hours'
 *   )::int AS succeeded_recent,
 *   COUNT(*) FILTER (
 *     WHERE status = 'failed'
 *       AND finished_at >= now() - interval '24 hours'
 *   )::int AS failed_recent,
 *   MIN(created_at) FILTER (WHERE status = 'queued') AS oldest_queued_at,
 *   MIN(started_at) FILTER (WHERE status = 'running') AS oldest_running_at
 * FROM planning_context_build_jobs
 * ```
 */
export const getBuildJobQueueHealth = new PreparedQuery<IGetBuildJobQueueHealthParams,IGetBuildJobQueueHealthResult>(getBuildJobQueueHealthIR);


