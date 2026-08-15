import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../core/store";

/**
 * Typed react-redux bindings — the only place the shell touches react-redux
 * generics (PLAN.md §6.3: RTK in core, react-redux in the shell only).
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
