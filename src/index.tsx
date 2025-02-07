import React, {
  useEffect,
  useRef,
  useState,
  useContext,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useMemo,
  useLayoutEffect,
} from "react";
import {
  LayoutAnimation,
  Platform,
  UIManager,
  View,
  ViewStyle,
  TouchableWithoutFeedback,
} from "react-native";
import { useSafeAreaFrame } from "react-native-safe-area-context";
import sortBy from "lodash/sortBy";

const isAndroid = Platform.OS === "android";

// Convenience method to enable this if it's not already enabled in your app.
// https://reactnative.dev/docs/layoutanimation.html#easeineaseout
const enableExperimentalLayoutAnimation = () => {
  if (isAndroid && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
};



type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

interface IWalkthroughStepMask {
  x: number;
  y: number;
  width: number;
  height: number;
  allowInteraction?: boolean;
}

interface IWalkthroughFunctions {
  registerStep: (step: IWalkthroughStep) => any;
  updateStep: (identifier, step: Partial<IWalkthroughStep>) => any;
  start: () => any;
  stop: () => any;
  next: () => any;
  goTo: (number: number) => any;
  previous: () => any;
  setTransitionDuration: (duration: number) => any;
  setBackdropColor: (color: string) => any;
}

interface IWalkthroughContext extends IWalkthroughFunctions {
  currentSteps: IWalkthroughStep[];
  allSteps: IWalkthroughStep[];
  backdropColor: string;
  transitionDuration: number;
  animateNextLayoutChange: (duration?: number) => any;
  debug: boolean;
  isWalkthroughOn: boolean;
  isReady: boolean;
  currentStepNumber: number;
  useIsFocused?: () => boolean;
}

interface ILayoutAdjustments {
  minX?: number;
  minY?: number;
  maxX?: number;
  maxY?: number;

  addX?: number;
  addY?: number;
  addWidth?: number;
  addHeight?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  addPadding?: number;
}

interface IOverlayComponentProps extends IWalkthroughContext {
  step: IWalkthroughStep; // pass through the step as well
}

interface IWalkthroughCallback {
  time: Date;
}

type EnableHardwareBackFunction = (
  props?: Pick<IWalkthroughFunctions, "goTo" | "previous">,
) => any;
type OnPressWithContextType = (context?: IWalkthroughContext) => any;
// TS will complain that we don't hav ea value in createContext but we actually want it null if not inside the provider.
// @ts-ignore
const WalkthroughContext = React.createContext<IWalkthroughContext>();
interface IWalkthroughStep {
  number: number;
  identifier: string;
  overlayComponentKey: string;
  // Pass through props to pass into the component. Make sure the props object does not remove keys or change order,
  // as it will cause an error when checking for a chance in values amongst the object values.
  overlayComponentProps?: any;
  OverlayComponent?: React.ComponentType<IOverlayComponentProps>;
  fullScreen?: boolean;
  layoutAdjustments?: ILayoutAdjustments;
  // Only allow the onLayout to get set once. This is useful on for example, scrollable containers where the position
  // on the page can change when you scroll.
  layoutLock?: boolean;
  enableHardwareBack?: boolean | EnableHardwareBackFunction; // android only - Pass in the step number to go back to that step
  onStart?: (props: IWalkthroughCallback) => any;
  onFinish?: (props: IWalkthroughCallback) => any;
  onBackground?: () => any;
  onPressMask?: OnPressWithContextType;
  onPressBackdrop?: OnPressWithContextType;
  mask: IWalkthroughStepMask;
  computedMask?: IWalkthroughStepMask;
  measureMask: () => any;
}

interface IOverlayProps {
  key: string;
  style: ViewStyle;
  onPress?: OnPressWithContextType;
}
const createLogger = (debug) => (number: number, str: string) =>
  debug ? console.log(`[WT][${number}]: ${str}`) : undefined;
const WalkthroughDisplayer = () => {
  const context = useContext<IWalkthroughContext>(WalkthroughContext);
  const {
    currentSteps,
    currentStepNumber,
    backdropColor,
    transitionDuration,
    animateNextLayoutChange,
    debug,
  } = context;

  const logStep = createLogger(debug);

  const lastStepsRef = useRef<IWalkthroughStep[]>([]);

  if (isAndroid) {

  }

  useLayoutEffect(
    () => {
      const time = new Date();
      // Only mark finish if we are advancing to the next step (going backwards doesn't count as marking off this step).
      // Or if we are at the end and currentStepNumber is undefined
      if (
        lastStepsRef.current.length &&
        (typeof currentStepNumber !== "number" ||
          lastStepsRef.current[0].number < currentStepNumber)
      ) {
        logStep(
          lastStepsRef.current[0].number,
          `Finished at ${time.getTime()}`,
        );
        lastStepsRef.current.forEach((step) => step.onFinish?.({ time }));
      }

      if (currentSteps.length) {
        animateNextLayoutChange(transitionDuration);

        logStep(currentStepNumber, `Started at ${time.getTime()}`);
        currentSteps.forEach((step) => {
          step.onStart?.({ time });
          step.measureMask();
        });
      }

      lastStepsRef.current = currentSteps;
    },
    // Need to do it based on currentSteps, since that changes when screens mount and things get added to the steps.
    [currentSteps.map((s) => s.identifier).join("|")],
  );

  const overlayProps = useMemo(
    () => {
      // We build the views from top to bottom
      const sortedCurrentSteps: IWalkthroughStep[] = sortBy(
        currentSteps,
        (step) => step.mask.y,
      );
      const arr: IOverlayProps[] = [];
      let markerY = 0;

      sortedCurrentSteps.forEach((step, i) => {
        const computedMask = step.computedMask;

        // Rectange on the top across the whole screen
        arr.push({
          key: `topRect-${i}`,
          onPress: step.onPressBackdrop,
          style: {
            backgroundColor: backdropColor,
            top: markerY,
            left: 0,
            right: 0,
            height: computedMask.y - markerY,
            ...(debug ? { borderWidth: 1, borderColor: "red" } : {}),
          },
        });
        // Rectange on the left side.
        arr.push({
          key: `leftRect-${i}`,
          onPress: step.onPressBackdrop,
          style: {
            backgroundColor: backdropColor,
            top: computedMask.y,
            left: 0,
            width: computedMask.x,
            height: computedMask.height,
            ...(debug ? { borderWidth: 1, borderColor: "blue" } : {}),
          },
        });
        // Rectange on the right side.
        arr.push({
          key: `rightRect-${i}`,
          onPress: step.onPressBackdrop,
          style: {
            backgroundColor: backdropColor,
            top: computedMask.y,
            left: computedMask.x + computedMask.width,
            right: 0,
            height: computedMask.height,
            ...(debug ? { borderWidth: 1, borderColor: "green" } : {}),
          },
        });
        // The bottom rectange up to the next component (or bottom of the screen)
        const nextStep =
          i + 1 < sortedCurrentSteps.length
            ? sortedCurrentSteps[i + 1]
            : undefined;
        if (!nextStep) {
          const top = computedMask.y + computedMask.height;
          arr.push({
            // We only have one of these (at the end) so want to give this the same key so it can be reused in the animation.
            key: `bottomRect`,
            onPress: step.onPressBackdrop,
            style: {
              backgroundColor: backdropColor,
              top,
              left: 0,
              right: 0,
              bottom: 0,
              ...(debug ? { borderWidth: 1, borderColor: "orange" } : {}),
            },
          });
        }

        // If we aren't allowing interaction on the highlighted region, then just put a view over that as well so its not pressable.
        if (!computedMask.allowInteraction) {
          arr.push({
            key: `coverRect-${i}`,
            onPress: step.onPressMask,
            style: {
              top: computedMask.y,
              left: computedMask.x,
              width: computedMask.width,
              height: computedMask.height,
              // on Android (not sure if all), if we have an empty View without a background, it will not take the
              // touchevents. Rather then experimenting with wrapping it with TouchableWithoutFeedback, etc, we simply
              // give it an *extremely* subtle background that's essentially not noticeable. This helps it steal the touch events.
              ...(isAndroid
                ? { backgroundColor: "#FFFFFF01", opacity: 0.1 }
                : {}),
              // Add a background color so in testing you can see that there is something over it.
              ...(debug
                ? {
                  borderWidth: 1,
                  borderColor: "forestgreen",
                  backgroundColor: "#0000FF33",
                }
                : {}),
            },
          });
        }
        markerY = computedMask.y + computedMask.height;
      });
      return arr;
    },
    [currentSteps, backdropColor, debug],
  );

  return (
    <>
      {overlayProps.map(({ key, onPress, style }) => {
        let content = (
          <View key={key} style={[style, { position: "absolute" }]} />
        );

        if (onPress) {
          content = (
            <TouchableWithoutFeedback
              key={key}
              onPress={() => onPress(context)}
            >
              {content}
            </TouchableWithoutFeedback>
          );
        }

        return content;
      })}
      {currentSteps.map((s) =>
        s.OverlayComponent ? (
          <s.OverlayComponent
            key={s.overlayComponentKey}
            step={s}
            {...(s.overlayComponentProps || {})}
            {...context}
          />
        ) : null,
      )}
    </>
  );
};

const defaultAnimateNextLayoutChange = (duration: number) =>
  LayoutAnimation.configureNext({
    duration,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    update: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.scaleXY,
    },
  });

interface IWalkthroughProvider
  extends Partial<
    Pick<
      IWalkthroughContext,
      | "useIsFocused"
      | "transitionDuration"
      | "backdropColor"
      | "animateNextLayoutChange"
      | "debug"
      >
    > {
  enableExperimentalLayoutAnimation?: boolean;
  children?: any;
}
const WalkthroughProvider = forwardRef<
  IWalkthroughFunctions,
  IWalkthroughProvider
  >(
  (
    {
      useIsFocused = () => true,
      transitionDuration: _transitionDuration = 300,
      backdropColor: _backdropColor = "#000000DA",
      animateNextLayoutChange = defaultAnimateNextLayoutChange,
      enableExperimentalLayoutAnimation: _enableExperimentalLayoutAnimation,
      debug,
      children,
    },
    ref,
  ) => {
    const [transitionDuration, setTransitionDuration] =
      useState<number>(_transitionDuration);
    const [backdropColor, setBackdropColor] = useState<string>(_backdropColor);
    const [steps, setSteps] = useState<IWalkthroughStep[]>([]);
    const [currentStepNumber, setCurrentStepNumber] = useState<number>();

    const isWalkthroughOn = Boolean(typeof currentStepNumber === "number");
    const isReady = useMemo(() => steps.some((s) => s.number === 1), [steps]);

    if (_enableExperimentalLayoutAnimation) {
      useEffect(enableExperimentalLayoutAnimation, []);
    }

    const currentSteps = useMemo(
      () =>
        isWalkthroughOn
          ? steps.filter((s) => s.number === currentStepNumber)
          : [],
      [isWalkthroughOn, currentStepNumber, steps],
    );

    const registerStep = useCallback<IWalkthroughFunctions["registerStep"]>(
      (step) =>
        setSteps((steps) =>
          sortBy(
            [step, ...steps.filter((s) => s.identifier !== step.identifier)],
            "number",
          ),
        ),
      [],
    );

    const updateStep = useCallback<IWalkthroughFunctions["updateStep"]>(
      (identifier, step) =>
        setSteps((steps) => {
          const oldStep = steps.find((s) => s.identifier === identifier);
          return sortBy(
            [
              { ...oldStep, ...step },
              ...steps.filter((s) => s.identifier !== identifier),
            ],
            "number",
          );
        }),
      [],
    );

    const next = useCallback<IWalkthroughFunctions["next"]>(
      () => setCurrentStepNumber((x) => (x || 0) + 1),
      [setCurrentStepNumber],
    );

    const previous = useCallback<IWalkthroughFunctions["previous"]>(
      () => setCurrentStepNumber((x) => (x ? x - 1 : 0)),
      [setCurrentStepNumber],
    );

    const goTo: IWalkthroughFunctions["goTo"] = setCurrentStepNumber;

    const start = useCallback<IWalkthroughFunctions["start"]>(() => {
      if (steps.length) {
        const step = steps[0]; // already ordered so take the first one
        setCurrentStepNumber(step.number);
      }
    }, [steps, setCurrentStepNumber]);

    const stop = useCallback<IWalkthroughFunctions["stop"]>(
      () => setCurrentStepNumber(undefined),
      [steps, setCurrentStepNumber],
    );

    const functions: IWalkthroughFunctions = {
      registerStep,
      updateStep,
      start,
      stop,
      next,
      previous,
      goTo,
      setTransitionDuration,
      setBackdropColor,
    };

    useImperativeHandle(ref, () => functions);

    return (
      <WalkthroughContext.Provider
        value={{
          ...functions,
          isWalkthroughOn,
          currentStepNumber,
          currentSteps,
          allSteps: steps, // want to be called "allSteps" so doesn't sound too close to "step".
          debug,
          animateNextLayoutChange,
          transitionDuration,
          backdropColor,
          useIsFocused,
          isReady,
        }}
      >
        {children}
        {/*@aryk - If we have no steps registered, don't mount the displayer */}
        {Boolean(steps.length) && <WalkthroughDisplayer />}
      </WalkthroughContext.Provider>
    );
  },
);

const useWalkthrough = () => {
  const context = useContext<IWalkthroughContext>(WalkthroughContext);
  if (!context) {
    throw "Make sure that this is called as a child of WalkthroughProvider.";
  }
  return context;
};

interface IUseWalkthroughStepStrict extends Omit<IWalkthroughStep, "mask"> {
  maskAllowInteraction?: boolean;
}
interface IUseWalkthroughStep
  extends PartialBy<
    IUseWalkthroughStepStrict,
    "identifier" | "overlayComponentKey" | "measureMask"
    > {}

const useWalkthroughStep = ({
  fullScreen,
  identifier,
  number,
  ...props
}: IUseWalkthroughStep) => {
  const context = useWalkthrough();

  const targetRef = useRef<any>();

  // On unmount, make sure to empty the targetRef. It might still be stored in the "steps" on the WalkthroughProvider.
  useEffect(
    () => () => {
      targetRef.current = undefined;
    },
    [],
  );

  // Better to provide an identifier, especially if you have multiple overlays at a single Step, then this
  // won't work.
  identifier = identifier || number.toString();

  const {
    registerStep,
    allSteps,
    currentStepNumber,
    debug,
    stop,
    useIsFocused,
  } = context;

  const step = useMemo(
    () => allSteps.find((s) => s.identifier === identifier),
    [identifier, allSteps],
  );

  // We want the step to be registered if the props change so that the render item reflects the new overlayComponentProps
  useEffect(
    () => {
      if (step && props.overlayComponentProps) {
        registerStep({
          ...step,
          overlayComponentProps: props.overlayComponentProps,
        })
      }
    },
    // Do not include step or any other dependency, will cause an infinite loop
    Object.values(props.overlayComponentProps || {}),
  )

  const isFocused = useIsFocused();
  const wasVisibleRef = useRef(false);
  useEffect(
    () => {
      if (currentStepNumber === number) {
        if (isFocused) {
          wasVisibleRef.current = true;
          // If we had this step visible on a screen, but now for some reason not anymore (maybe they navigated for a notification)
          // then we basically reset the tutorial and stop it so it doesn't stay on the screen as they navigate.
        } else if (wasVisibleRef.current) {
          stop();
        }
        // When the walkthrough is stopped, we need to reset this flag.
      } else if (currentStepNumber === undefined) {
        wasVisibleRef.current = false;
      }
    },
    [currentStepNumber, isFocused]
  );

  // https://stackoverflow.com/a/64882955/7180620
  const registerStepWithProps = useCallback(
    (maskProps: IWalkthroughStepMask) => {
      const { maskAllowInteraction, ...stepProps } = propsRef.current;
      logStep(stepProps.number, `Setting mask: ${JSON.stringify(maskProps)}`);

      const mask: IWalkthroughStepMask = {
        allowInteraction: maskAllowInteraction,
        ...maskProps,
      };

      let step: IWalkthroughStep = {
        ...stepProps,
        mask,
        computedMask: mask, // default, overwrite in next block maybe...
      };

      if (step.layoutAdjustments) {
        const la = step.layoutAdjustments;
        step = {
          ...step,
          computedMask: {
            allowInteraction: mask.allowInteraction,
            x: Math.min(Math.max(la.minX || -Number.POSITIVE_INFINITY, (la.x ?? step.mask.x) + (la.addX ?? -(la.addPadding || 0))), Number.POSITIVE_INFINITY),
            y: Math.min(Math.max(la.minY || -Number.POSITIVE_INFINITY, (la.y ?? step.mask.y) + (la.addY ?? -(la.addPadding || 0))), Number.POSITIVE_INFINITY),
            width:
              (la.width ?? step.mask.width) +
              (la.addWidth ?? (la.addPadding || 0) * 2),
            height:
              (la.height ?? step.mask.height) +
              (la.addHeight ?? (la.addPadding || 0) * 2),
          },
        }
      }

      registerStep(step);
    },
    [registerStep],
  );

  const onMeasure = useCallback(
    (_, __, width, height, x, y) =>
      registerStepWithProps({ width, height, x, y }),
    [registerStepWithProps],
  );

  const logStep = createLogger(debug);

  const propsRef = useRef<IUseWalkthroughStepStrict>();
  useEffect(() => {
    propsRef.current = {
      identifier,
      number,
      measureMask: () => {
        if (targetRef.current) {
          targetRef.current.measure((_, __, width, height, x, y) => {
            const newPosition =
              step &&
              // If component is unmounted, then this will be undefined
              width &&
              height &&
              x &&
              y &&
              (step.mask.x !== x ||
                step.mask.y !== y ||
                step.mask.width !== width ||
                step.mask.height !== height);

            if (newPosition) {
              registerStepWithProps({ width, height, x, y });
            }
          });
        }
      },
      overlayComponentKey: identifier,
      ...props,
    };
  });

  const { width, height } = useSafeAreaFrame();

  useEffect(
    () => {
      if (fullScreen && width && height) {
        // We basically put a line at the bottom of the screen so that we blank out the whole screen.
        registerStepWithProps({ x: 0, y: height, width, height });
      }
    },
    [fullScreen, registerStepWithProps, width, height],
  );

  const layoutLockRef = useRef(false);
  const onLayout = useCallback(
    (event) => {
      if (!layoutLockRef.current) {
        targetRef.current = event.target; // store it to measure later
        event.target.measure(onMeasure);
      }
      layoutLockRef.current = props.layoutLock;
    },
    [onMeasure, props.layoutLock],
  );

  return {
    ...context,
    isVisible: number === currentStepNumber,
    onLayout,
    onMeasure,
    step,
  };
};

export {
  enableExperimentalLayoutAnimation,
  IWalkthroughStepMask,
  IWalkthroughFunctions,
  IWalkthroughContext,
  IOverlayComponentProps,
  IWalkthroughStep,
  IWalkthroughProvider,
  WalkthroughProvider,
  IUseWalkthroughStep,
  useWalkthrough,
  useWalkthroughStep,
  IWalkthroughCallback,
};
